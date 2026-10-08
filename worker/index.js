/**
 * ============================================================
 * SCHOOL STALL COMMERCE API
 * ============================================================
 *
 * Handles:
 * - Students
 * - Contributions
 * - Ownership
 * - Products
 * - Inventory
 * - Orders
 * - Expenses
 * - Dashboard
 *
 * Cloudflare KV:
 * - STALL_DATA
 * - STALL_SEQUENCES
 * ============================================================
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};

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

      /* ======================================================
         BASIC
      ====================================================== */

      if (path === "/" && method === "GET") {
        return json({
          success: true,
          service: "School Stall Commerce API",
          status: "online"
        });
      }

      if (path === "/api/health" && method === "GET") {
        return json({
          success: true,
          status: "healthy",
          service: "school-stall-commerce"
        });
      }


      /* ======================================================
         STUDENTS
      ====================================================== */

      if (path === "/api/students" && method === "GET") {
        return getStudents(env);
      }

      if (path === "/api/students" && method === "POST") {
        return createStudent(request, env);
      }

      if (path === "/api/students/ownership" && method === "GET") {
        return getOwnership(env);
      }


      /* ======================================================
         CONTRIBUTIONS
      ====================================================== */

      if (path === "/api/contributions" && method === "GET") {
        return getContributions(env);
      }

      if (path === "/api/contributions" && method === "POST") {
        return createContribution(request, env);
      }

      if (
        path.startsWith("/api/contributions/") &&
        path.endsWith("/approve") &&
        method === "POST"
      ) {
        const contributionId = path.split("/")[3];

        return approveContribution(
          contributionId,
          request,
          env
        );
      }

      if (
        path.startsWith("/api/contributions/") &&
        path.endsWith("/reject") &&
        method === "POST"
      ) {
        const contributionId = path.split("/")[3];

        return rejectContribution(
          contributionId,
          request,
          env
        );
      }


      /* ======================================================
         PRODUCTS
      ====================================================== */

      if (path === "/api/products" && method === "GET") {
        return getProducts(env);
      }

      if (path === "/api/products" && method === "POST") {
        return createProduct(request, env);
      }

      if (
        path.startsWith("/api/products/") &&
        method === "PUT"
      ) {
        const productId = path.split("/")[3];

        return updateProduct(
          productId,
          request,
          env
        );
      }


      /* ======================================================
         INVENTORY
      ====================================================== */

      if (
        path.startsWith("/api/inventory/") &&
        path.endsWith("/adjust") &&
        method === "POST"
      ) {
        const productId = path.split("/")[3];

        return adjustInventory(
          productId,
          request,
          env
        );
      }


      /* ======================================================
         ORDERS
      ====================================================== */

      if (path === "/api/orders" && method === "GET") {
        return getOrders(env);
      }


      /* ======================================================
         EXPENSES
      ====================================================== */

      if (path === "/api/expenses" && method === "GET") {
        return getExpenses(env);
      }


      /* ======================================================
         DASHBOARD
      ====================================================== */

      if (path === "/api/dashboard" && method === "GET") {
        return getDashboard(env);
      }


      return json(
        {
          success: false,
          error: "Route not found",
          path
        },
        404
      );

    } catch (error) {

      console.error(error);

      return json(
        {
          success: false,
          error: error.message || "Internal server error"
        },
        500
      );
    }
  }
};


/* ============================================================
   RESPONSE HELPERS
============================================================ */

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: CORS_HEADERS
    }
  );
}


async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}


/* ============================================================
   ID GENERATOR
============================================================ */

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase()}`;
}


/* ============================================================
   KV PREFIX READER
============================================================ */

async function getDataByPrefix(env, prefix) {

  const result = await env.STALL_DATA.list({
    prefix
  });

  const records = [];

  for (const key of result.keys) {

    const value = await env.STALL_DATA.get(
      key.name,
      "json"
    );

    if (value) {
      records.push(value);
    }
  }

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
    a.name.localeCompare(b.name)
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

  if (!name) {
    return json(
      {
        success: false,
        error: "Student name is required"
      },
      400
    );
  }

  const id = createId("STU");

  const student = {
    id,
    name,
    role: body.role || "Member",
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
   CONTRIBUTIONS
============================================================ */

async function getContributions(env) {

  const contributions = await getDataByPrefix(
    env,
    "CONTRIBUTION:"
  );

  contributions.sort(
    (a, b) =>
      new Date(b.submittedAt) -
      new Date(a.submittedAt)
  );

  return json({
    success: true,
    contributions,
    count: contributions.length
  });
}


async function createContribution(request, env) {

  const body = await readJson(request);

  const studentId = String(
    body.studentId || ""
  ).trim();

  const type = String(
    body.type || ""
  ).trim().toLowerCase();

  const description = String(
    body.description || ""
  ).trim();

  const agreedValue = Number(
    body.agreedValue
  );

  if (!studentId) {
    return json(
      {
        success: false,
        error: "Student is required"
      },
      400
    );
  }

  if (
    !["cash", "goods", "labour", "service"].includes(type)
  ) {
    return json(
      {
        success: false,
        error: "Invalid contribution type"
      },
      400
    );
  }

  if (
    !Number.isFinite(agreedValue) ||
    agreedValue <= 0
  ) {
    return json(
      {
        success: false,
        error: "Agreed value must be greater than zero"
      },
      400
    );
  }

  const student = await env.STALL_DATA.get(
    `STUDENT:${studentId}`,
    "json"
  );

  if (!student) {
    return json(
      {
        success: false,
        error: "Student not found"
      },
      404
    );
  }

  const id = createId("CON");

  const contribution = {
    id,
    studentId,
    studentName: student.name,
    type,
    description,
    agreedValue,
    status: "pending",
    submittedAt: new Date().toISOString(),
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
    contribution
  }, 201);
}


/* ============================================================
   APPROVE CONTRIBUTION
============================================================ */

async function approveContribution(
  contributionId,
  request,
  env
) {

  const key =
    `CONTRIBUTION:${contributionId}`;

  const contribution =
    await env.STALL_DATA.get(
      key,
      "json"
    );

  if (!contribution) {
    return json(
      {
        success: false,
        error: "Contribution not found"
      },
      404
    );
  }

  if (contribution.status !== "pending") {
    return json(
      {
        success: false,
        error:
          `Contribution is already ${contribution.status}`
      },
      400
    );
  }

  const body = await readJson(request);

  contribution.status = "approved";
  contribution.approvedAt =
    new Date().toISOString();

  contribution.approvedBy =
    body.approvedBy || "Admin";

  await env.STALL_DATA.put(
    key,
    JSON.stringify(contribution)
  );

  return json({
    success: true,
    contribution
  });
}


/* ============================================================
   REJECT CONTRIBUTION
============================================================ */

async function rejectContribution(
  contributionId,
  request,
  env
) {

  const key =
    `CONTRIBUTION:${contributionId}`;

  const contribution =
    await env.STALL_DATA.get(
      key,
      "json"
    );

  if (!contribution) {
    return json(
      {
        success: false,
        error: "Contribution not found"
      },
      404
    );
  }

  if (contribution.status !== "pending") {
    return json(
      {
        success: false,
        error:
          `Contribution is already ${contribution.status}`
      },
      400
    );
  }

  const body = await readJson(request);

  contribution.status = "rejected";
  contribution.rejectedAt =
    new Date().toISOString();

  contribution.rejectedBy =
    body.rejectedBy || "Admin";

  await env.STALL_DATA.put(
    key,
    JSON.stringify(contribution)
  );

  return json({
    success: true,
    contribution
  });
}


/* ============================================================
   OWNERSHIP
============================================================ */

async function getOwnership(env) {

  const contributions =
    await getDataByPrefix(
      env,
      "CONTRIBUTION:"
    );

  const approved =
    contributions.filter(
      contribution =>
        contribution.status === "approved"
    );

  const totals = {};

  for (const contribution of approved) {

    if (!totals[contribution.studentId]) {

      totals[contribution.studentId] = {
        studentId:
          contribution.studentId,

        studentName:
          contribution.studentName,

        contribution: 0
      };
    }

    totals[
      contribution.studentId
    ].contribution += Number(
      contribution.agreedValue
    );
  }

  const totalApprovedContribution =
    Object.values(totals)
      .reduce(
        (sum, item) =>
          sum + item.contribution,
        0
      );

  const ownership =
    Object.values(totals)
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
          b.ownershipPercentage -
          a.ownershipPercentage
      );

  return json({
    success: true,
    totalApprovedContribution,
    ownership
  });
}


/* ============================================================
   PRODUCTS
============================================================ */

async function getProducts(env) {

  const products =
    await getDataByPrefix(
      env,
      "PRODUCT:"
    );

  products.sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return json({
    success: true,
    products,
    count: products.length
  });
}


/* ============================================================
   CREATE PRODUCT
============================================================ */

async function createProduct(request, env) {

  const body = await readJson(request);

  const name = String(
    body.name || ""
  ).trim();

  const sellingPrice =
    Number(body.sellingPrice);

  const costPrice =
    Number(body.costPrice || 0);

  const openingStock =
    Number(body.openingStock || 0);

  const reorderLevel =
    Number(body.reorderLevel || 0);

  if (!name) {
    return json(
      {
        success: false,
        error: "Product name is required"
      },
      400
    );
  }

  if (
    !Number.isFinite(sellingPrice) ||
    sellingPrice <= 0
  ) {
    return json(
      {
        success: false,
        error:
          "Selling price must be greater than zero"
      },
      400
    );
  }

  if (
    !Number.isFinite(costPrice) ||
    costPrice < 0
  ) {
    return json(
      {
        success: false,
        error: "Invalid cost price"
      },
      400
    );
  }

  if (
    !Number.isFinite(openingStock) ||
    openingStock < 0
  ) {
    return json(
      {
        success: false,
        error: "Invalid opening stock"
      },
      400
    );
  }

  if (
    !Number.isFinite(reorderLevel) ||
    reorderLevel < 0
  ) {
    return json(
      {
        success: false,
        error: "Invalid reorder level"
      },
      400
    );
  }

  const id = createId("PROD");

  const product = {

    id,

    name,

    sellingPrice,

    costPrice,

    stockQuantity:
      openingStock,

    reorderLevel,

    active: true,

    createdAt:
      new Date().toISOString(),

    updatedAt:
      new Date().toISOString()
  };

  await env.STALL_DATA.put(
    `PRODUCT:${id}`,
    JSON.stringify(product)
  );

  return json({
    success: true,
    product
  }, 201);
}


/* ============================================================
   UPDATE PRODUCT
============================================================ */

async function updateProduct(
  productId,
  request,
  env
) {

  const key =
    `PRODUCT:${productId}`;

  const product =
    await env.STALL_DATA.get(
      key,
      "json"
    );

  if (!product) {
    return json(
      {
        success: false,
        error: "Product not found"
      },
      404
    );
  }

  const body = await readJson(request);

  if (body.name !== undefined) {

    const name =
      String(body.name).trim();

    if (!name) {
      return json(
        {
          success: false,
          error:
            "Product name cannot be empty"
        },
        400
      );
    }

    product.name = name;
  }

  if (body.sellingPrice !== undefined) {

    const price =
      Number(body.sellingPrice);

    if (
      !Number.isFinite(price) ||
      price <= 0
    ) {
      return json(
        {
          success: false,
          error:
            "Invalid selling price"
        },
        400
      );
    }

    product.sellingPrice = price;
  }

  if (body.costPrice !== undefined) {

    const price =
      Number(body.costPrice);

    if (
      !Number.isFinite(price) ||
      price < 0
    ) {
      return json(
        {
          success: false,
          error:
            "Invalid cost price"
        },
        400
      );
    }

    product.costPrice = price;
  }

  if (body.reorderLevel !== undefined) {

    const level =
      Number(body.reorderLevel);

    if (
      !Number.isFinite(level) ||
      level < 0
    ) {
      return json(
        {
          success: false,
          error:
            "Invalid reorder level"
        },
        400
      );
    }

    product.reorderLevel = level;
  }

  if (body.active !== undefined) {
    product.active =
      Boolean(body.active);
  }

  product.updatedAt =
    new Date().toISOString();

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
   INVENTORY ADJUSTMENT
============================================================ */

async function adjustInventory(
  productId,
  request,
  env
) {

  const key =
    `PRODUCT:${productId}`;

  const product =
    await env.STALL_DATA.get(
      key,
      "json"
    );

  if (!product) {
    return json(
      {
        success: false,
        error: "Product not found"
      },
      404
    );
  }

  const body = await readJson(request);

  const change =
    Number(body.change);

  const reason =
    String(
      body.reason || "Manual adjustment"
    ).trim();

  if (
    !Number.isFinite(change) ||
    change === 0
  ) {
    return json(
      {
        success: false,
        error:
          "Inventory change must not be zero"
      },
      400
    );
  }

  const newStock =
    Number(product.stockQuantity) +
    change;

  if (newStock < 0) {
    return json(
      {
        success: false,
        error:
          "Inventory cannot go below zero"
      },
      400
    );
  }

  product.stockQuantity =
    newStock;

  product.updatedAt =
    new Date().toISOString();

  await env.STALL_DATA.put(
    key,
    JSON.stringify(product)
  );

  const inventoryRecord = {

    id: createId("INV"),

    productId,

    productName:
      product.name,

    change,

    previousStock:
      newStock - change,

    newStock,

    reason,

    createdAt:
      new Date().toISOString()
  };

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
   ORDERS
============================================================ */

async function getOrders(env) {

  const orders =
    await getDataByPrefix(
      env,
      "ORDER:"
    );

  orders.sort(
    (a, b) =>
      new Date(b.createdAt) -
      new Date(a.createdAt)
  );

  return json({
    success: true,
    orders,
    count: orders.length
  });
}


/* ============================================================
   EXPENSES
============================================================ */

async function getExpenses(env) {

  const expenses =
    await getDataByPrefix(
      env,
      "EXPENSE:"
    );

  expenses.sort(
    (a, b) =>
      new Date(b.createdAt) -
      new Date(a.createdAt)
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

  const students =
    await getDataByPrefix(
      env,
      "STUDENT:"
    );

  const contributions =
    await getDataByPrefix(
      env,
      "CONTRIBUTION:"
    );

  const products =
    await getDataByPrefix(
      env,
      "PRODUCT:"
    );

  const orders =
    await getDataByPrefix(
      env,
      "ORDER:"
    );

  const expenses =
    await getDataByPrefix(
      env,
      "EXPENSE:"
    );


  const approvedContributions =
    contributions.filter(
      contribution =>
        contribution.status === "approved"
    );


  const pendingContributions =
    contributions.filter(
      contribution =>
        contribution.status === "pending"
    );


  const totalContributions =
    approvedContributions.reduce(
      (sum, contribution) =>
        sum +
        Number(
          contribution.agreedValue || 0
        ),
      0
    );


  const totalSales =
    orders.reduce(
      (sum, order) =>
        sum +
        Number(
          order.total || 0
        ),
      0
    );


  const totalExpenses =
    expenses.reduce(
      (sum, expense) =>
        sum +
        Number(
          expense.amount || 0
        ),
      0
    );


  const totalStockUnits =
    products.reduce(
      (sum, product) =>
        sum +
        Number(
          product.stockQuantity || 0
        ),
      0
    );


  return json({

    success: true,

    students:
      students.length,

    products:
      products.length,

    orders:
      orders.length,

    approvedContributions:
      totalContributions,

    pendingContributions:
      pendingContributions.length,

    totalSales,

    totalExpenses,

    netPosition:
      totalSales -
      totalExpenses,

    totalStockUnits

  });
}
