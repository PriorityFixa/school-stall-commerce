
/**
 * ============================================================
 * SCHOOL STALL COMMERCE API
 * ============================================================
 *
 * Features:
 * - Students
 * - Contributions, approval and rejection
 * - Ownership calculations
 * - Products
 * - Inventory and history
 * - Orders and stock deduction
 * - Pending and partially paid orders
 * - Later payments and payment history
 * - Expenses
 * - Dashboard
 *
 * Required KV binding: STALL_DATA
 * Required secret for payment routes: STALL_PAYMENT_PIN
 *
 * IMPORTANT:
 * Later payments update the existing order only.
 * They do not create orders or deduct stock again.
 * ============================================================
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Stall-Pin",
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
  return json({ success: false, error: message }, status);
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
            "/api/orders/unpaid",
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

      if (path === "/api/contributions" && method === "GET") {
        return getContributions(env);
      }

      if (path === "/api/contributions" && method === "POST") {
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

      // Payment routes must be deployed for the seller page to work.
      if (
        path === "/api/orders/unpaid" &&
        method === "GET"
      ) {
        const authError = authorizePaymentRequest(request, env);
        if (authError) return authError;

        return getUnpaidOrders(env);
      }

      const paymentMatch = path.match(
        /^\/api\/orders\/([^/]+)\/payments$/
      );

      if (paymentMatch && method === "POST") {
        const authError = authorizePaymentRequest(request, env);
        if (authError) return authError;

        return recordOrderPayment(
          decodeURIComponent(paymentMatch[1]),
          request,
          env
        );
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

      if (record) records.push(record);
    }

    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor);

  return records;
}

/* ============================================================
   STUDENTS
============================================================ */

async function getStudents(env) {
  const students = await getDataByPrefix(env, "STUDENT:");

  students.sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""))
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

  return json({ success: true, student }, 201);
}

/* ============================================================
   CONTRIBUTIONS
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

async function createContribution(request, env) {
  const body = await readJson(request);

  const studentId = String(body.studentId || "").trim();
  const rawType = String(body.type || "").trim().toLowerCase();
  const description = String(body.description || "").trim();
  const notes = String(body.notes || "").trim();

  const aliases = {
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

  const type = aliases[rawType];

  if (!studentId) {
    return errorResponse("Student is required");
  }

  if (!type) {
    return errorResponse(
      "Select money/cash, items/goods, labour, or service"
    );
  }

  if (!description) {
    return errorResponse("Contribution description is required");
  }

  const student = await env.STALL_DATA.get(
    `STUDENT:${studentId}`,
    "json"
  );

  if (!student) {
    return errorResponse("Student not found", 404);
  }

  const hasQuantity =
    body.quantity !== undefined && body.quantity !== "";

  const hasUnitValue =
    body.unitValue !== undefined && body.unitValue !== "";

  let quantity = hasQuantity ? Number(body.quantity) : 1;
  let unitValue;
  let totalValue;

  if (hasQuantity && hasUnitValue) {
    quantity = Number(body.quantity);
    unitValue = Number(body.unitValue);

    totalValue =
      body.totalValue !== undefined && body.totalValue !== ""
        ? Number(body.totalValue)
        : quantity * unitValue;
  } else {
    totalValue = Number(
      body.totalValue ?? body.agreedValue ?? body.value
    );

    if (!Number.isFinite(quantity) || quantity <= 0) {
      quantity = 1;
    }

    unitValue = totalValue / quantity;
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return errorResponse("Quantity must be greater than zero");
  }

  if (!Number.isFinite(unitValue) || unitValue < 0) {
    return errorResponse("Unit value must be zero or greater");
  }

  if (!Number.isFinite(totalValue) || totalValue <= 0) {
    return errorResponse(
      "Total contribution value must be greater than zero"
    );
  }

  const suppliedDate = body.date ? new Date(body.date) : new Date();

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

async function approveContribution(id, request, env) {
  const key = `CONTRIBUTION:${id}`;
  const contribution = await env.STALL_DATA.get(key, "json");

  if (!contribution) {
    return errorResponse("Contribution not found", 404);
  }

  if (contribution.status !== "pending") {
    return errorResponse(
      `Contribution is already ${contribution.status}`
    );
  }

  const body = await readJson(request);
  const now = new Date().toISOString();

  contribution.status = "approved";
  contribution.approvedAt = now;
  contribution.approvedBy =
    String(body.approvedBy || "Admin").trim() || "Admin";
  contribution.updatedAt = now;

  await env.STALL_DATA.put(key, JSON.stringify(contribution));

  return json({
    success: true,
    message: "Contribution approved",
    contribution
  });
}

async function rejectContribution(id, request, env) {
  const key = `CONTRIBUTION:${id}`;
  const contribution = await env.STALL_DATA.get(key, "json");

  if (!contribution) {
    return errorResponse("Contribution not found", 404);
  }

  if (contribution.status !== "pending") {
    return errorResponse(
      `Contribution is already ${contribution.status}`
    );
  }

  const body = await readJson(request);
  const now = new Date().toISOString();

  contribution.status = "rejected";
  contribution.rejectedAt = now;
  contribution.rejectedBy =
    String(body.rejectedBy || "Admin").trim() || "Admin";
  contribution.updatedAt = now;

  await env.STALL_DATA.put(key, JSON.stringify(contribution));

  return json({
    success: true,
    message: "Contribution rejected",
    contribution
  });
}

/* ============================================================
   OWNERSHIP
============================================================ */

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
    item => item.status === "approved"
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
      contribution.totalValue ?? contribution.agreedValue ?? 0
    );
  }

  const totalApprovedContribution = Object.values(totals).reduce(
    (sum, item) => sum + item.contribution,
    0
  );

  const ownership = Object.values(totals)
    .map(item => ({
      ...item,
      ownershipPercentage:
        totalApprovedContribution > 0
          ? (item.contribution / totalApprovedContribution) * 100
          : 0
    }))
    .sort((a, b) =>
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
   PRODUCTS
============================================================ */

async function getProducts(env) {
  const products = await getDataByPrefix(env, "PRODUCT:");

  products.sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""))
  );

  return json({
    success: true,
    products,
    count: products.length
  });
}

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

  if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) {
    return errorResponse("Selling price must be greater than zero");
  }

  if (!Number.isFinite(costPrice) || costPrice < 0) {
    return errorResponse("Invalid cost price");
  }

  if (!Number.isInteger(openingStock) || openingStock < 0) {
    return errorResponse(
      "Opening stock must be a non-negative whole number"
    );
  }

  if (!Number.isInteger(reorderLevel) || reorderLevel < 0) {
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

  return json({ success: true, product }, 201);
}

async function updateProduct(productId, request, env) {
  const key = `PRODUCT:${productId}`;
  const product = await env.STALL_DATA.get(key, "json");

  if (!product) {
    return errorResponse("Product not found", 404);
  }

  const body = await readJson(request);

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) {
      return errorResponse("Product name cannot be empty");
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
    if (!Number.isInteger(level) || level < 0) {
      return errorResponse("Invalid reorder level");
    }
    product.reorderLevel = level;
  }

  if (body.active !== undefined) {
    product.active = Boolean(body.active);
  }

  product.updatedAt = new Date().toISOString();

  await env.STALL_DATA.put(key, JSON.stringify(product));

  return json({ success: true, product });
}

/* ============================================================
   INVENTORY
============================================================ */

async function adjustInventory(productId, request, env) {
  const key = `PRODUCT:${productId}`;
  const product = await env.STALL_DATA.get(key, "json");

  if (!product) {
    return errorResponse("Product not found", 404);
  }

  const body = await readJson(request);
  const change = Number(body.change);
  const reason = String(body.reason || "Manual adjustment").trim();

  if (!Number.isInteger(change) || change === 0) {
    return errorResponse(
      "Inventory change must be a non-zero whole number"
    );
  }

  const previousStock = Number(product.stockQuantity || 0);
  const newStock = previousStock + change;

  if (newStock < 0) {
    return errorResponse("Inventory cannot go below zero");
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

  await env.STALL_DATA.put(key, JSON.stringify(product));
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

async function getInventoryHistory(env) {
  const inventory = await getDataByPrefix(env, "INVENTORY:");

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

  const sellerName = String(body.sellerName || "").trim();
  const customerName = String(body.customerName || "").trim();
  const customerPhone = String(body.customerPhone || "").trim();
  const paymentMethod = String(body.paymentMethod || "cash")
    .trim()
    .toLowerCase();

  const items = Array.isArray(body.items) ? body.items : [];

  if (!sellerName) {
    return errorResponse("Seller name is required");
  }

  if (!items.length) {
    return errorResponse("Order must contain at least one product");
  }

  if (!["cash", "mpesa", "credit"].includes(paymentMethod)) {
    return errorResponse("Invalid payment method");
  }

  const orderItems = [];
  const requestedQuantities = {};
  let total = 0;

  // Validate all products and quantities before saving the order.
  for (const requestedItem of items) {
    const productId = String(requestedItem.productId || "").trim();
    const quantity = Number(requestedItem.quantity);

    if (!productId) {
      return errorResponse("A product ID is missing");
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return errorResponse(
        "Product quantity must be a positive whole number"
      );
    }

    const product = await env.STALL_DATA.get(
      `PRODUCT:${productId}`,
      "json"
    );

    if (!product) {
      return errorResponse(`Product not found: ${productId}`, 404);
    }

    if (product.active === false) {
      return errorResponse(`${product.name} is no longer available`);
    }

    const unitPrice = Number(product.sellingPrice);
    const costPrice = Number(product.costPrice || 0);

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      return errorResponse(`Invalid selling price for ${product.name}`);
    }

    if (!Number.isFinite(costPrice) || costPrice < 0) {
      return errorResponse(`Invalid cost price for ${product.name}`);
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

  // Validate total quantities, including repeated product IDs.
  for (const [productId, quantity] of Object.entries(
    requestedQuantities
  )) {
    const product = await env.STALL_DATA.get(
      `PRODUCT:${productId}`,
      "json"
    );

    if (!product) {
      return errorResponse(`Product not found: ${productId}`, 404);
    }

    const currentStock = Number(product.stockQuantity || 0);

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

  const amountPaid = paymentMethod === "cash" ? total : 0;
  const balance = Math.max(0, total - amountPaid);

  const order = {
    id: orderId,
    sellerName,
    customerName,
    customerPhone,
    paymentMethod,
    items: orderItems,
    total,
    amountPaid,
    balance,
    payments: [],
    currency: "KES",
    status: "completed",
    paymentStatus,
    createdAt: now,
    updatedAt: now
  };

  // Save order and deduct stock once for this new order.
  await env.STALL_DATA.put(
    `ORDER:${orderId}`,
    JSON.stringify(order)
  );

  for (const [productId, quantity] of Object.entries(
    requestedQuantities
  )) {
    const key = `PRODUCT:${productId}`;
    const product = await env.STALL_DATA.get(key, "json");

    if (!product) {
      console.error(
        "Product disappeared while processing order:",
        productId
      );
      continue;
    }

    const previousStock = Number(product.stockQuantity || 0);
    const newStock = previousStock - quantity;

    product.stockQuantity = newStock;
    product.updatedAt = new Date().toISOString();

    await env.STALL_DATA.put(key, JSON.stringify(product));

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
    order: getOrderPaymentDetails(order)
  }, 201);
}

/* ============================================================
   ORDERS: LIST ALL
============================================================ */

async function getOrders(env) {
  const records = await getDataByPrefix(env, "ORDER:");

  const orders = records
    .map(getOrderPaymentDetails)
    .sort((a, b) =>
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
   LATER PAYMENTS: ACCESS CONTROL
============================================================ */

function authorizePaymentRequest(request, env) {
  const configuredPin = env.STALL_PAYMENT_PIN;

  if (!configuredPin) {
    return errorResponse(
      "Payment access is not configured. Set STALL_PAYMENT_PIN in Cloudflare Worker secrets.",
      503
    );
  }

  const suppliedPin = request.headers.get("X-Stall-Pin") || "";

  if (suppliedPin !== configuredPin) {
    return errorResponse("Invalid payment access PIN", 401);
  }

  return null;
}

/* ============================================================
   LATER PAYMENTS: NORMALIZE OLD AND NEW ORDERS
============================================================ */

function getOrderPaymentDetails(order) {
  const total = Math.max(0, Number(order.total) || 0);

  let amountPaid;

  if (order.amountPaid !== undefined && order.amountPaid !== null) {
    amountPaid = Number(order.amountPaid) || 0;
  } else if (String(order.paymentStatus || "").toUpperCase() === "PAID") {
    // Keep legacy paid orders paid.
    amountPaid = total;
  } else {
    amountPaid = 0;
  }

  amountPaid = Math.min(total, Math.max(0, amountPaid));

  const balance = Math.max(
    0,
    Math.round((total - amountPaid) * 100) / 100
  );

  let paymentStatus;

  if (balance <= 0.000001) {
    paymentStatus = "PAID";
  } else if (amountPaid > 0) {
    paymentStatus = "PARTIALLY_PAID";
  } else if (
    String(order.paymentStatus || "").toUpperCase() === "PENDING"
  ) {
    paymentStatus = "PENDING";
  } else {
    paymentStatus = "UNPAID";
  }

  return {
    ...order,
    amountPaid,
    balance,
    paymentStatus,
    payments: Array.isArray(order.payments) ? order.payments : []
  };
}

/* ============================================================
   LATER PAYMENTS: LIST OUTSTANDING ORDERS
============================================================ */

async function getUnpaidOrders(env) {
  const allOrders = await getDataByPrefix(env, "ORDER:");

  const orders = allOrders
    .filter(order =>
      String(order.status || "").toLowerCase() !== "cancelled"
    )
    .map(getOrderPaymentDetails)
    .filter(order => order.balance > 0.000001)
    .sort((a, b) =>
      new Date(b.createdAt || 0) -
      new Date(a.createdAt || 0)
    );

  const totalOutstanding = Math.round(
    orders.reduce((sum, order) => sum + order.balance, 0) * 100
  ) / 100;

  return json({
    success: true,
    orders,
    count: orders.length,
    totalOutstanding
  });
}

/* ============================================================
   LATER PAYMENTS: RECORD PAYMENT AGAINST EXISTING ORDER
============================================================ */

async function recordOrderPayment(orderId, request, env) {
  const key = `ORDER:${orderId}`;
  const order = await env.STALL_DATA.get(key, "json");

  if (!order) {
    return errorResponse("Order not found", 404);
  }

  if (String(order.status || "").toLowerCase() === "cancelled") {
    return errorResponse(
      "Payments cannot be recorded against a cancelled order."
    );
  }

  const current = getOrderPaymentDetails(order);

  if (current.balance <= 0.000001) {
    return errorResponse("This order is already fully paid.");
  }

  const body = await readJson(request);
  const amount = Number(body.amount);
  const method = String(body.method || "").trim().toLowerCase();
  const reference = String(body.reference || "").trim();
  const recordedBy = String(body.recordedBy || "Seller").trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    return errorResponse(
      "Enter a valid payment amount greater than zero."
    );
  }

  if (!["cash", "mpesa"].includes(method)) {
    return errorResponse("Payment method must be cash or mpesa.");
  }

  if (amount > current.balance + 0.000001) {
    return errorResponse(
      `Payment exceeds the outstanding balance of KSh ${current.balance.toFixed(2)}.`
    );
  }

  // For M-Pesa, confirm receipt before recording the transaction.
  if (method === "mpesa" && !reference) {
    return errorResponse(
      "Enter the M-Pesa transaction reference after confirming receipt."
    );
  }

  const now = new Date().toISOString();

  const payment = {
    id: createId("PAY"),
    amount: Math.round(amount * 100) / 100,
    method,
    reference: reference || null,
    recordedBy: recordedBy || "Seller",
    createdAt: now
  };

  const updatedAmountPaid = Math.round(
    (current.amountPaid + payment.amount) * 100
  ) / 100;

  const updatedBalance = Math.max(
    0,
    Math.round((current.total - updatedAmountPaid) * 100) / 100
  );

  const updatedOrder = {
    ...order,
    amountPaid: updatedAmountPaid,
    balance: updatedBalance,
    payments: [...current.payments, payment],
    paymentStatus: updatedBalance <= 0.000001
      ? "PAID"
      : "PARTIALLY_PAID",
    updatedAt: now
  };

  // Only the existing order record is updated here.
  // No new order and no stock deduction.
  await env.STALL_DATA.put(key, JSON.stringify(updatedOrder));

  return json({
    success: true,
    message: updatedOrder.paymentStatus === "PAID"
      ? "Payment recorded. Order is fully paid."
      : "Payment recorded. Outstanding balance updated.",
    order: getOrderPaymentDetails(updatedOrder),
    payment
  });
}

/* ============================================================
   EXPENSES: GET
============================================================ */

async function getExpenses(env) {
  const expenses = await getDataByPrefix(env, "EXPENSE:");

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
    item => item.status === "approved"
  );

  const pendingContributions = contributions.filter(
    item => item.status === "pending"
  );

  const rejectedContributions = contributions.filter(
    item => item.status === "rejected"
  );

  const totalContributions = approvedContributions.reduce(
    (sum, item) =>
      sum + Number(item.totalValue ?? item.agreedValue ?? 0),
    0
  );

  const completedOrders = orders.filter(
    order => order.status === "completed"
  );

  // Sales value represents the full value of completed orders.
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

  const totalCollected = completedOrders.reduce(
    (sum, order) => {
      const details = getOrderPaymentDetails(order);
      return sum + details.amountPaid;
    },
    0
  );

  const totalOutstanding = completedOrders.reduce(
    (sum, order) => {
      const details = getOrderPaymentDetails(order);
      return sum + details.balance;
    },
    0
  );

  const totalExpenses = expenses.reduce(
    (sum, expense) => sum + Number(expense.amount || 0),
    0
  );

  const grossProfit = totalSales - totalCostOfGoodsSold;
  const netProfit = grossProfit - totalExpenses;

  const totalStockUnits = products.reduce(
    (sum, product) => sum + Number(product.stockQuantity || 0),
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

    approvedContributions: totalContributions,
    totalContributions,
    pendingContributions: pendingContributions.length,
    rejectedContributions: rejectedContributions.length,

    totalSales,
    totalCollected,
    totalOutstanding,
    totalCostOfGoodsSold,
    totalExpenses,
    grossProfit,
    netProfit,
    netPosition: totalSales - totalExpenses,

    totalStockUnits,
    lowStockProducts: lowStockProducts.length
  });
}
