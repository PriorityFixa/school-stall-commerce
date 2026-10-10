
/**
 * ============================================================
 * SCHOOL STALL COMMERCE API
 * ============================================================
 *
 * Modules:
 * - Students
 * - Contributions: money, items, labour, optional service
 * - Approval and rejection
 * - Ownership calculations
 * - Products
 * - Inventory
 * - Orders
 * - Expenses
 * - Dashboard
 *
 * Required Cloudflare KV namespace:
 * - STALL_DATA
 *
 * Optional KV namespace:
 * - STALL_SEQUENCES (not required by this version)
 * ============================================================
 */


/* ============================================================
   CORS AND RESPONSE HELPERS
============================================================ */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: CORS_HEADERS
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase()}`;
}

function errorResponse(message, status = 400) {
  return json({
    success: false,
    error: message
  }, status);
}


/* ============================================================
   MAIN WORKER AND ROUTES
============================================================ */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    try {
      // Check that the required KV binding exists.
      if (!env.STALL_DATA) {
        return json({
          success: false,
          error: "Missing Cloudflare KV binding: STALL_DATA"
        }, 500);
      }

      /* BASIC */

      if (path === "/" && method === "GET") {
        return json({
          success: true,
          service: "School Stall Commerce API",
          status: "online",
          endpoints: [
            "/api/health",
            "/api/students",
            "/api/students/ownership",
            "/api/contributions",
            "/api/products",
            "/api/inventory",
            "/api/orders",
            "/api/expenses",
            "/api/dashboard"
          ]
        });
      }

      if (path === "/api/health" && method === "GET") {
        return json({
          success: true,
          status: "healthy",
          service: "school-stall-commerce",
          time: new Date().toISOString()
        });
      }

      /* STUDENTS */

      if (path === "/api/students" && method === "GET") {
        return getStudents(env);
      }

      if (path === "/api/students" && method === "POST") {
        return createStudent(request, env);
      }

      if (
        path === "/api/students/ownership" &&
        method === "GET"
      ) {
        return getOwnership(env);
      }

      /* CONTRIBUTIONS */

      if (
        path === "/api/contributions" &&
        method === "GET"
      ) {
        return getContributions(env);
      }

      if (
        path === "/api/contributions" &&
        method === "POST"
      ) {
        return createContribution(request, env);
      }

      const approveMatch = path.match(
        /^\/api\/contributions\/([^/]+)\/approve$/
      );

      if (approveMatch && method === "POST") {
        return approveContribution(
          decodeURIComponent(approveMatch[1]),
          request,
          env
        );
      }

      const rejectMatch = path.match(
        /^\/api\/contributions\/([^/]+)\/reject$/
      );

      if (rejectMatch && method === "POST") {
        return rejectContribution(
          decodeURIComponent(rejectMatch[1]),
          request,
          env
        );
      }

      /* PRODUCTS */

      if (path === "/api/products" && method === "GET") {
        return getProducts(env);
      }

      if (path === "/api/products" && method === "POST") {
        return createProduct(request, env);
      }

      const productMatch = path.match(
        /^\/api\/products\/([^/]+)$/
      );

      if (productMatch && method === "PUT") {
        return updateProduct(
          decodeURIComponent(productMatch[1]),
          request,
          env
        );
      }

      /* INVENTORY */

      if (path === "/api/inventory" && method === "GET") {
        return getInventoryHistory(env);
      }

      const inventoryMatch = path.match(
        /^\/api\/inventory\/([^/]+)\/adjust$/
      );

      if (inventoryMatch && method === "POST") {
        return adjustInventory(
          decodeURIComponent(inventoryMatch[1]),
          request,
          env
        );
      }

      /* ORDERS */

      if (path === "/api/orders" && method === "GET") {
        return getOrders(env);
      }

      if (path === "/api/orders" && method === "POST") {
        return createOrder(request, env);
      }

      /* EXPENSES */

      if (path === "/api/expenses" && method === "GET") {
        return getExpenses(env);
      }

      /* DASHBOARD */

      if (path === "/api/dashboard" && method === "GET") {
        return getDashboard(env);
      }

      return json({
        success: false,
        error: "Route not found",
        path
      }, 404);

    } catch (error) {
      console.error("School Stall Worker error:", error);

      return json({
        success: false,
        error: error.message || "Internal server error"
      }, 500);
    }
  }
};


/* ============================================================
   GENERIC KV READER
============================================================ */

async function getDataByPrefix(env, prefix) {
  const records = [];
  let cursor;

  do {
    const result = await env.STALL_DATA.list({
      prefix,
      limit: 1000,
      ...(cursor ? { cursor } : {})
    });

    for (const key of result.keys) {
      const record = await env.STALL_DATA.get(
        key.name,
        "json"
      );

      if (record) {
        records.push(record);
      }
    }

    cursor = result.list_complete
      ? undefined
      : result.cursor;

  } while (cursor);

  return records;
}


/* ============================================================
   STUDENTS
============================================================ */

async function getStudents(env) {
  const students = await getDataByPrefix(
    env,
    "STUDENT:"
  );

  students.sort((a, b) =>
    String(a.name || "").localeCompare(
      String(b.name || "")
    )
  );

  return json({
    success: true,
    students,
    count: students.length
  });
}


async function createStudent(request, env) {
  const body = await readJson(request);

  const name = String(body.name || "").trim();
  const role = String(body.role || "Member").trim();

  if (!name) {
    return errorResponse("Student name is required");
  }

  const id = createId("STU");

  const student = {
    id,
    name,
    role,
    status: "active",
    createdAt: new Date().toISOString()
  };

  await env.STALL_DATA.put(
    `STUDENT:${id}`,
    JSON.stringify(student)
  );

  return json({
    success: true,
    student
  }, 201);
}


/* ============================================================
   CONTRIBUTIONS: GET HISTORY
============================================================ */

async function getContributions(env) {
  const contributions = await getDataByPrefix(
    env,
    "CONTRIBUTION:"
  );

  contributions.sort((a, b) =>
    new Date(b.submittedAt || b.createdAt || 0) -
    new Date(a.submittedAt || a.createdAt || 0)
  );

  return json({
    success: true,
    contributions,
    count: contributions.length
  });
}


/* ============================================================
   CONTRIBUTIONS: CREATE
============================================================ */

/*
 * Accepted contribution types:
 *
 * cash / money  -> cash
 * goods / items -> goods
 * labour / labor -> labour
 * service       -> service
 *
 * Supports the existing form's "value" field and the newer
 * quantity + unitValue + totalValue fields.
 */

async function createContribution(request, env) {
  const body = await readJson(request);

  const studentId = String(
    body.studentId || ""
  ).trim();

  const rawType = String(
    body.type || ""
  ).trim().toLowerCase();

  const typeAliases = {
    money: "cash",
    cash: "cash",
    items: "goods",
    item: "goods",
    goods: "goods",
    stock: "goods",
    labour: "labour",
    labor: "labour",
    service: "service"
  };

  const type = typeAliases[rawType];

  const description = String(
    body.description || ""
  ).trim();

  const notes = String(
    body.notes || ""
  ).trim();

  if (!studentId) {
    return errorResponse("Student is required");
  }

  if (!type) {
    return errorResponse(
      "Select money/cash, items/goods, labour, or service"
    );
  }

  if (!description) {
    return errorResponse(
      "Contribution description is required"
    );
  }

  const student = await env.STALL_DATA.get(
    `STUDENT:${studentId}`,
    "json"
  );

  if (!student) {
    return errorResponse("Student not found", 404);
  }

  const hasQuantity =
    body.quantity !== undefined &&
    body.quantity !== "";

  const hasUnitValue =
    body.unitValue !== undefined &&
    body.unitValue !== "";

  let quantity = hasQuantity
    ? Number(body.quantity)
    : 1;

  let unitValue;
  let totalValue;

  if (hasQuantity && hasUnitValue) {
    quantity = Number(body.quantity);
    unitValue = Number(body.unitValue);

    totalValue =
      body.totalValue !== undefined &&
      body.totalValue !== ""
        ? Number(body.totalValue)
        : quantity * unitValue;

  } else {
    // Backwards compatibility with the existing form:
    // { studentId, type, description, value }
    totalValue = Number(
      body.totalValue ??
      body.agreedValue ??
      body.value
    );

    if (!Number.isFinite(quantity) || quantity <= 0) {
      quantity = 1;
    }

    unitValue = totalValue / quantity;
  }

  if (
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    return errorResponse(
      "Quantity must be greater than zero"
    );
  }

  if (
    !Number.isFinite(unitValue) ||
    unitValue < 0
  ) {
    return errorResponse(
      "Unit value must be zero or greater"
    );
  }

  if (
    !Number.isFinite(totalValue) ||
    totalValue <= 0
  ) {
    return errorResponse(
      "Total contribution value must be greater than zero"
    );
  }

  // Use a supplied date when valid; otherwise use the current date.
  const suppliedDate = body.date
    ? new Date(body.date)
    : new Date();

  if (Number.isNaN(suppliedDate.getTime())) {
    return errorResponse("Invalid contribution date");
  }

  const id = createId("CON");
  const now = new Date().toISOString();

  const contribution = {
    id,

    studentId,
    studentName: student.name,

    type,
    description,

    quantity,
    unitValue,

    // Both fields are saved for compatibility with existing
    // pages and dashboard calculations.
    totalValue,
    agreedValue: totalValue,

    date: suppliedDate.toISOString(),
    notes,

    status: "pending",

    submittedAt: now,
    createdAt: now,

    approvedAt: null,
    approvedBy: null,

    rejectedAt: null,
    rejectedBy: null
  };

  await env.STALL_DATA.put(
    `CONTRIBUTION:${id}`,
    JSON.stringify(contribution)
  );

  return json({
    success: true,
    message: "Contribution recorded and awaiting approval",
    contribution
  }, 201);
}


/* ============================================================
   CONTRIBUTIONS: APPROVE
============================================================ */

async function approveContribution(
  contributionId,
  request,
  env
) {
  const key = `CONTRIBUTION:${contributionId}`;

  const contribution = await env.STALL_DATA.get(
    key,
    "json"
  );

  if (!contribution) {
    return errorResponse(
      "Contribution not found",
      404
    );
  }

  if (contribution.status !== "pending") {
    return errorResponse(
      `Contribution is already ${contribution.status}`,
      400
    );
  }

  const body = await readJson(request);

  const approvedBy = String(
    body.approvedBy || "Admin"
  ).trim();

  const now = new Date().toISOString();

  contribution.status = "approved";
  contribution.approvedAt = now;
  contribution.approvedBy = approvedBy || "Admin";
  contribution.updatedAt = now;

  await env.STALL_DATA.put(
    key,
    JSON.stringify(contribution)
  );

  return json({
    success: true,
    message: "Contribution approved",
    contribution
  });
}


/* ============================================================
   CONTRIBUTIONS: REJECT
============================================================ */

async function rejectContribution(
  contributionId,
  request,
  env
) {
  const key = `CONTRIBUTION:${contributionId}`;

  const contribution = await env.STALL_DATA.get(
    key,
    "json"
  );

  if (!contribution) {
    return errorResponse(
      "Contribution not found",
      404
    );
  }

  if (contribution.status !== "pending") {
    return errorResponse(
      `Contribution is already ${contribution.status}`,
      400
    );
  }

  const body = await readJson(request);

  const rejectedBy = String(
    body.rejectedBy || "Admin"
  ).trim();

  const now = new Date().toISOString();

  contribution.status = "rejected";
  contribution.rejectedAt = now;
  contribution.rejectedBy = rejectedBy || "Admin";
  contribution.updatedAt = now;

  await env.STALL_DATA.put(
    key,
    JSON.stringify(contribution)
  );

  return json({
    success: true,
    message: "Contribution rejected",
    contribution
  });
}


/* ============================================================
   OWNERSHIP
============================================================ */

/*
 * Only approved contributions count towards ownership.
 * Pending and rejected contributions do not count.
 */

async function getOwnership(env) {
  const [students, contributions] = await Promise.all([
    getDataByPrefix(env, "STUDENT:"),
    getDataByPrefix(env, "CONTRIBUTION:")
  ]);

  const totals = {};

  for (const student of students) {
    totals[student.id] = {
      studentId: student.id,
      studentName: student.name,
      role: student.role || "Member",
      contribution: 0
    };
  }

  const approved = contributions.filter(
    contribution => contribution.status === "approved"
  );

  for (const contribution of approved) {
    const studentId = contribution.studentId;

    if (!totals[studentId]) {
      totals[studentId] = {
        studentId,
        studentName: contribution.studentName || "Unknown student",
        role: "Member",
        contribution: 0
      };
    }

    totals[studentId].contribution += Number(
      contribution.totalValue ??
      contribution.agreedValue ??
      0
    );
  }

  const totalApprovedContribution = Object.values(
    totals
  ).reduce(
    (sum, item) => sum + item.contribution,
    0
  );

  const ownership = Object.values(totals)
    .map(item => ({
      ...item,
      ownershipPercentage:
        totalApprovedContribution > 0
          ? (
              item.contribution /
              totalApprovedContribution
            ) * 100
          : 0
    }))
    .sort(
      (a, b) =>
        b.ownershipPercentage - a.ownershipPercentage
    );

  return json({
    success: true,
    totalApprovedContribution,
    ownership,
    count: ownership.length
  });
}


/* ============================================================
   PRODUCTS: GET
============================================================ */

async function getProducts(env) {
  const products = await getDataByPrefix(
    env,
    "PRODUCT:"
  );

  products.sort((a, b) =>
    String(a.name || "").localeCompare(
      String(b.name || "")
    )
  );

  return json({
    success: true,
    products,
    count: products.length
  });
}


/* ============================================================
   PRODUCTS: CREATE
============================================================ */

async function createProduct(request, env) {
  const body = await readJson(request);

  const name = String(body.name || "").trim();
  const sellingPrice = Number(body.sellingPrice);
  const costPrice = Number(body.costPrice ?? 0);
  const openingStock = Number(body.openingStock ?? 0);
  const reorderLevel = Number(body.reorderLevel ?? 0);

  if (!name) {
    return errorResponse("Product name is required");
  }

  if (
    !Number.isFinite(sellingPrice) ||
    sellingPrice <= 0
  ) {
    return errorResponse(
      "Selling price must be greater than zero"
    );
  }

  if (!Number.isFinite(costPrice) || costPrice < 0) {
    return errorResponse("Invalid cost price");
  }

  if (
    !Number.isInteger(openingStock) ||
    openingStock < 0
  ) {
    return errorResponse(
      "Opening stock must be a non-negative whole number"
    );
  }

  if (
    !Number.isInteger(reorderLevel) ||
    reorderLevel < 0
  ) {
    return errorResponse(
      "Reorder level must be a non-negative whole number"
    );
  }

  const id = createId("PROD");
  const now = new Date().toISOString();

  const product = {
    id,
    name,
    sellingPrice,
    costPrice,
    stockQuantity: openingStock,
    reorderLevel,
    active: true,
    createdAt: now,
    updatedAt: now
  };

  await env.STALL_DATA.put(
    `PRODUCT:${id}`,
    JSON.stringify(product)
  );

  if (openingStock > 0) {
    const inventoryRecord = {
      id: createId("INV"),
      productId: id,
      productName: name,
      change: openingStock,
      previousStock: 0,
      newStock: openingStock,
      reason: "Opening stock",
      createdAt: now
    };

    await env.STALL_DATA.put(
      `INVENTORY:${inventoryRecord.id}`,
      JSON.stringify(inventoryRecord)
    );
  }

  return json({
    success: true,
    product
  }, 201);
}


/* ============================================================
   PRODUCTS: UPDATE
============================================================ */

async function updateProduct(
  productId,
  request,
  env
) {
  const key = `PRODUCT:${productId}`;

  const product = await env.STALL_DATA.get(
    key,
    "json"
  );

  if (!product) {
    return errorResponse("Product not found", 404);
  }

  const body = await readJson(request);

  if (body.name !== undefined) {
    const name = String(body.name).trim();

    if (!name) {
      return errorResponse(
        "Product name cannot be empty"
      );
    }

    product.name = name;
  }

  if (body.sellingPrice !== undefined) {
    const price = Number(body.sellingPrice);

    if (!Number.isFinite(price) || price <= 0) {
      return errorResponse("Invalid selling price");
    }

    product.sellingPrice = price;
  }

  if (body.costPrice !== undefined) {
    const price = Number(body.costPrice);

    if (!Number.isFinite(price) || price < 0) {
      return errorResponse("Invalid cost price");
    }

    product.costPrice = price;
  }

  if (body.reorderLevel !== undefined) {
    const level = Number(body.reorderLevel);

    if (
      !Number.isInteger(level) ||
      level < 0
    ) {
      return errorResponse("Invalid reorder level");
    }

    product.reorderLevel = level;
  }

  if (body.active !== undefined) {
    product.active = Boolean(body.active);
  }

  product.updatedAt = new Date().toISOString();

  await env.STALL_DATA.put(
    key,
    JSON.stringify(product)
  );

  return json({
    success: true,
    product
  });
}


/* ============================================================
   INVENTORY: MANUAL ADJUSTMENT
============================================================ */

async function adjustInventory(
  productId,
  request,
  env
) {
  const key = `PRODUCT:${productId}`;

  const product = await env.STALL_DATA.get(
    key,
    "json"
  );

  if (!product) {
    return errorResponse("Product not found", 404);
  }

  const body = await readJson(request);
  const change = Number(body.change);

  const reason = String(
    body.reason || "Manual adjustment"
  ).trim();

  if (
    !Number.isInteger(change) ||
    change === 0
  ) {
    return errorResponse(
      "Inventory change must be a non-zero whole number"
    );
  }

  const previousStock = Number(
    product.stockQuantity || 0
  );

  const newStock = previousStock + change;

  if (newStock < 0) {
    return errorResponse(
      "Inventory cannot go below zero"
    );
  }

  const now = new Date().toISOString();

  product.stockQuantity = newStock;
  product.updatedAt = now;

  const inventoryRecord = {
    id: createId("INV"),
    productId,
    productName: product.name,
    change,
    previousStock,
    newStock,
    reason,
    createdAt: now
  };

  await env.STALL_DATA.put(
    key,
    JSON.stringify(product)
  );

  await env.STALL_DATA.put(
    `INVENTORY:${inventoryRecord.id}`,
    JSON.stringify(inventoryRecord)
  );

  return json({
    success: true,
    product,
    inventoryRecord
  });
}


/* ============================================================
   INVENTORY: HISTORY
============================================================ */

async function getInventoryHistory(env) {
  const inventory = await getDataByPrefix(
    env,
    "INVENTORY:"
  );

  inventory.sort((a, b) =>
    new Date(b.createdAt || 0) -
    new Date(a.createdAt || 0)
  );

  return json({
    success: true,
    inventory,
    count: inventory.length
  });
}


/* ============================================================
   ORDERS: CREATE
============================================================ */

async function createOrder(request, env) {
  const body = await readJson(request);

  const sellerName = String(
    body.sellerName || ""
  ).trim();

  const customerName = String(
    body.customerName || ""
  ).trim();

  const customerPhone = String(
    body.customerPhone || ""
  ).trim();

  const paymentMethod = String(
    body.paymentMethod || "cash"
  ).trim().toLowerCase();

  const items = Array.isArray(body.items)
    ? body.items
    : [];

  if (!sellerName) {
    return errorResponse("Seller name is required");
  }

  if (!items.length) {
    return errorResponse(
      "Order must contain at least one product"
    );
  }

  const allowedPaymentMethods = [
    "cash",
    "mpesa",
    "credit"
  ];

  if (!allowedPaymentMethods.includes(paymentMethod)) {
    return errorResponse("Invalid payment method");
  }

  /*
   * Validate all requested products and quantities before
   * saving the order or changing stock.
   */
  const orderItems = [];
  const requestedQuantities = {};
  let total = 0;

  for (const requestedItem of items) {
    const productId = String(
      requestedItem.productId || ""
    ).trim();

    const quantity = Number(
      requestedItem.quantity
    );

    if (!productId) {
      return errorResponse("A product ID is missing");
    }

    if (
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      return errorResponse(
        "Product quantity must be a positive whole number"
      );
    }

    const product = await env.STALL_DATA.get(
      `PRODUCT:${productId}`,
      "json"
    );

    if (!product) {
      return errorResponse(
        `Product not found: ${productId}`,
        404
      );
    }

    if (product.active === false) {
      return errorResponse(
        `${product.name} is no longer available`
      );
    }

    const unitPrice = Number(product.sellingPrice);
    const costPrice = Number(product.costPrice || 0);

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      return errorResponse(
        `Invalid selling price for ${product.name}`
      );
    }

    if (!Number.isFinite(costPrice) || costPrice < 0) {
      return errorResponse(
        `Invalid cost price for ${product.name}`
      );
    }

    requestedQuantities[productId] =
      (requestedQuantities[productId] || 0) + quantity;

    const lineTotal = unitPrice * quantity;
    total += lineTotal;

    orderItems.push({
      productId: product.id,
      productName: product.name,
      quantity,
      unitPrice,
      lineTotal,
      costPrice
    });
  }

  // Check combined quantities for repeated product IDs.
  for (const [productId, quantity] of Object.entries(
    requestedQuantities
  )) {
    const product = await env.STALL_DATA.get(
      `PRODUCT:${productId}`,
      "json"
    );

    if (!product) {
      return errorResponse(
        `Product not found: ${productId}`,
        404
      );
    }

    const currentStock = Number(
      product.stockQuantity || 0
    );

    if (quantity > currentStock) {
      return errorResponse(
        `Not enough stock for ${product.name}. Available: ${currentStock}`
      );
    }
  }

  const orderId = createId("ORD");
  const now = new Date().toISOString();

  let paymentStatus = "PENDING";

  if (paymentMethod === "cash") {
    paymentStatus = "PAID";
  } else if (paymentMethod === "credit") {
    paymentStatus = "UNPAID";
  }

  const order = {
    id: orderId,
    sellerName,
    customerName,
    customerPhone,
    paymentMethod,
    items: orderItems,
    total,
    currency: "KES",
    status: "completed",
    paymentStatus,
    createdAt: now,
    updatedAt: now
  };

  /*
   * Save the order, then update stock and inventory history.
   * This is a basic KV workflow, not a transactional database
   * operation; simultaneous sales may still require stronger
   * concurrency protection.
   */
  await env.STALL_DATA.put(
    `ORDER:${orderId}`,
    JSON.stringify(order)
  );

  for (const [productId, quantity] of Object.entries(
    requestedQuantities
  )) {
    const key = `PRODUCT:${productId}`;

    const product = await env.STALL_DATA.get(
      key,
      "json"
    );

    if (!product) {
      console.error(
        "Product disappeared while processing order:",
        productId
      );
      continue;
    }

    const previousStock = Number(
      product.stockQuantity || 0
    );

    const newStock = previousStock - quantity;

    product.stockQuantity = newStock;
    product.updatedAt = new Date().toISOString();

    await env.STALL_DATA.put(
      key,
      JSON.stringify(product)
    );

    const inventoryRecord = {
      id: createId("INV"),
      productId,
      productName: product.name,
      change: -quantity,
      previousStock,
      newStock,
      reason: `Sale ${orderId}`,
      orderId,
      createdAt: now
    };

    await env.STALL_DATA.put(
      `INVENTORY:${inventoryRecord.id}`,
      JSON.stringify(inventoryRecord)
    );
  }

  return json({
    success: true,
    message: "Order created successfully",
    order
  }, 201);
}


/* ============================================================
   ORDERS: GET
============================================================ */

async function getOrders(env) {
  const orders = await getDataByPrefix(
    env,
    "ORDER:"
  );

  orders.sort((a, b) =>
    new Date(b.createdAt || 0) -
    new Date(a.createdAt || 0)
  );

  return json({
    success: true,
    orders,
    count: orders.length
  });
}


/* ============================================================
   EXPENSES: GET
============================================================ */

async function getExpenses(env) {
  const expenses = await getDataByPrefix(
    env,
    "EXPENSE:"
  );

  expenses.sort((a, b) =>
    new Date(b.createdAt || 0) -
    new Date(a.createdAt || 0)
  );

  return json({
    success: true,
    expenses,
    count: expenses.length
  });
}


/* ============================================================
   DASHBOARD
============================================================ */

async function getDashboard(env) {
  const [
    students,
    contributions,
    products,
    orders,
    expenses
  ] = await Promise.all([
    getDataByPrefix(env, "STUDENT:"),
    getDataByPrefix(env, "CONTRIBUTION:"),
    getDataByPrefix(env, "PRODUCT:"),
    getDataByPrefix(env, "ORDER:"),
    getDataByPrefix(env, "EXPENSE:")
  ]);

  const approvedContributions = contributions.filter(
    contribution => contribution.status === "approved"
  );

  const pendingContributions = contributions.filter(
    contribution => contribution.status === "pending"
  );

  const rejectedContributions = contributions.filter(
    contribution => contribution.status === "rejected"
  );

  const totalContributions = approvedContributions.reduce(
    (sum, contribution) =>
      sum + Number(
        contribution.totalValue ??
        contribution.agreedValue ??
        0
      ),
    0
  );

  const completedOrders = orders.filter(
    order => order.status === "completed"
  );

  const totalSales = completedOrders.reduce(
    (sum, order) => sum + Number(order.total || 0),
    0
  );

  const totalCostOfGoodsSold = completedOrders.reduce(
    (sum, order) => {
      const orderCost = Array.isArray(order.items)
        ? order.items.reduce(
            (itemSum, item) =>
              itemSum +
              Number(item.costPrice || 0) *
              Number(item.quantity || 0),
            0
          )
        : 0;

      return sum + orderCost;
    },
    0
  );

  const totalExpenses = expenses.reduce(
    (sum, expense) =>
      sum + Number(expense.amount || 0),
    0
  );

  const grossProfit =
    totalSales - totalCostOfGoodsSold;

  const netProfit =
    grossProfit - totalExpenses;

  const totalStockUnits = products.reduce(
    (sum, product) =>
      sum + Number(product.stockQuantity || 0),
    0
  );

  const activeProducts = products.filter(
    product => product.active !== false
  );

  const lowStockProducts = activeProducts.filter(
    product =>
      Number(product.stockQuantity || 0) <=
      Number(product.reorderLevel || 0)
  );

  return json({
    success: true,

    students: students.length,
    products: products.length,
    activeProducts: activeProducts.length,
    orders: orders.length,

    // Contribution figures are based on approved records.
    approvedContributions: totalContributions,
    totalContributions,
    pendingContributions: pendingContributions.length,
    rejectedContributions: rejectedContributions.length,

    totalSales,
    totalCostOfGoodsSold,
    totalExpenses,
    grossProfit,
    netProfit,

    netPosition: totalSales - totalExpenses,

    totalStockUnits,
    lowStockProducts: lowStockProducts.length
  });
}
