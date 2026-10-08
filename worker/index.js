/**
 * ============================================================
 * SCHOOL STALL COMMERCE API
 * Build 2 — Students & Contributions
 * ============================================================
 *
 * KV:
 * - STALL_DATA
 * - STALL_SEQUENCES
 *
 * Supports:
 * - Health check
 * - Students
 * - Contributions
 * - Ownership calculation
 * - Products
 * - Orders
 * - Expenses
 * - Dashboard
 */

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: JSON_HEADERS,
  });
}

function cors() {
  return new Response(null, {
    status: 204,
    headers: JSON_HEADERS,
  });
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 8)}`;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    try {
      if (request.method === "OPTIONS") {
        return cors();
      }

      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;

      /* ======================================================
         HEALTH
      ====================================================== */

      if (path === "/api/health" && method === "GET") {
        return json({
          success: true,
          service: "School Stall Commerce API",
          status: "online",
          version: "2.0.0",
          time: new Date().toISOString(),
        });
      }

      /* ======================================================
         ROOT
      ====================================================== */

      if (path === "/" && method === "GET") {
        return json({
          success: true,
          service: "School Stall Commerce API",
          version: "2.0.0",
          endpoints: [
            "/api/health",
            "/api/students",
            "/api/students/ownership",
            "/api/contributions",
            "/api/products",
            "/api/orders",
            "/api/expenses",
            "/api/dashboard",
          ],
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

      if (
        path === "/api/students/ownership" &&
        method === "GET"
      ) {
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

      /* ======================================================
         PRODUCTS
      ====================================================== */

      if (path === "/api/products" && method === "GET") {
        return getProducts(env);
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
          error: "Endpoint not found",
          path,
        },
        404
      );
    } catch (error) {
      return json(
        {
          success: false,
          error: "Server error",
          message: error.message,
        },
        500
      );
    }
  },
};


/* ============================================================
   STUDENTS
============================================================ */

async function createStudent(request, env) {
  const body = await readJson(request);

  if (!body) {
    return json(
      {
        success: false,
        error: "Invalid JSON body",
      },
      400
    );
  }

  const name = String(body.name || "").trim();

  if (!name) {
    return json(
      {
        success: false,
        error: "Student name is required",
      },
      400
    );
  }

  const studentId = createId("STU");

  const student = {
    id: studentId,
    name,
    role: String(body.role || "Member").trim(),
    active: body.active !== false,
    createdAt: new Date().toISOString(),
  };

  await env.STALL_DATA.put(
    `STUDENT:${studentId}`,
    JSON.stringify(student)
  );

  return json(
    {
      success: true,
      message: "Student created successfully",
      student,
    },
    201
  );
}


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
    count: students.length,
  });
}


/* ============================================================
   CONTRIBUTIONS
============================================================ */

async function createContribution(request, env) {
  const body = await readJson(request);

  if (!body) {
    return json(
      {
        success: false,
        error: "Invalid JSON body",
      },
      400
    );
  }

  const studentId = String(
    body.studentId || ""
  ).trim();

  const type = String(
    body.type || ""
  ).trim().toLowerCase();

  const description = String(
    body.description || ""
  ).trim();

  const value = Number(body.value);

  if (!studentId) {
    return json(
      {
        success: false,
        error: "studentId is required",
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
        error:
          "Contribution type must be cash, goods, labour, or service",
      },
      400
    );
  }

  if (!Number.isFinite(value) || value <= 0) {
    return json(
      {
        success: false,
        error: "Contribution value must be greater than zero",
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
        error: "Student not found",
      },
      404
    );
  }

  const contributionId = createId("CON");

  /*
   * Contributions require approval.
   * They do NOT affect ownership until approved.
   */

  const contribution = {
    id: contributionId,
    studentId,
    studentName: student.name,

    type,

    description,

    agreedValue: value,

    status: "pending",

    submittedAt: new Date().toISOString(),

    approvedAt: null,
    approvedBy: null,
  };

  await env.STALL_DATA.put(
    `CONTRIBUTION:${contributionId}`,
    JSON.stringify(contribution)
  );

  return json(
    {
      success: true,
      message:
        "Contribution submitted for approval",
      contribution,
    },
    201
  );
}


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
    count: contributions.length,
  });
}


/* ============================================================
   OWNERSHIP
============================================================ */

async function getOwnership(env) {
  const students = await getDataByPrefix(
    env,
    "STUDENT:"
  );

  const contributions = await getDataByPrefix(
    env,
    "CONTRIBUTION:"
  );

  const approved = contributions.filter(
    contribution =>
      contribution.status === "approved"
  );

  const totals = {};

  for (const student of students) {
    totals[student.id] = 0;
  }

  for (const contribution of approved) {
    if (!totals[contribution.studentId]) {
      totals[contribution.studentId] = 0;
    }

    totals[contribution.studentId] += Number(
      contribution.agreedValue || 0
    );
  }

  const totalCapital = Object.values(
    totals
  ).reduce(
    (sum, value) => sum + value,
    0
  );

  const ownership = students.map(student => {
    const contributionValue =
      totals[student.id] || 0;

    const percentage =
      totalCapital > 0
        ? (contributionValue /
            totalCapital) *
          100
        : 0;

    return {
      studentId: student.id,
      studentName: student.name,

      contributionValue,

      ownershipPercentage:
        Number(percentage.toFixed(2)),
    };
  });

  ownership.sort(
    (a, b) =>
      b.contributionValue -
      a.contributionValue
  );

  return json({
    success: true,

    totalApprovedContribution:
      totalCapital,

    ownership,
  });
}


/* ============================================================
   PRODUCTS
============================================================ */

async function getProducts(env) {
  const products = await getDataByPrefix(
    env,
    "PRODUCT:"
  );

  return json({
    success: true,
    products,
    count: products.length,
  });
}


/* ============================================================
   ORDERS
============================================================ */

async function getOrders(env) {
  const orders = await getDataByPrefix(
    env,
    "ORDER:"
  );

  return json({
    success: true,
    orders,
    count: orders.length,
  });
}


/* ============================================================
   EXPENSES
============================================================ */

async function getExpenses(env) {
  const expenses = await getDataByPrefix(
    env,
    "EXPENSE:"
  );

  return json({
    success: true,
    expenses,
    count: expenses.length,
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
    expenses,
  ] = await Promise.all([
    getDataByPrefix(env, "STUDENT:"),
    getDataByPrefix(env, "CONTRIBUTION:"),
    getDataByPrefix(env, "PRODUCT:"),
    getDataByPrefix(env, "ORDER:"),
    getDataByPrefix(env, "EXPENSE:"),
  ]);

  const approvedContributions =
    contributions.filter(
      item => item.status === "approved"
    );

  const totalContributions =
    approvedContributions.reduce(
      (sum, item) =>
        sum +
        Number(item.agreedValue || 0),
      0
    );

  const pendingContributions =
    contributions.filter(
      item => item.status === "pending"
    );

  const totalSales =
    orders.reduce(
      (sum, item) =>
        sum + Number(item.total || 0),
      0
    );

  const totalExpenses =
    expenses.reduce(
      (sum, item) =>
        sum + Number(item.amount || 0),
      0
    );

  return json({
    success: true,

    dashboard: {
      students: students.length,

      products: products.length,

      orders: orders.length,

      approvedContributions:
        approvedContributions.length,

      pendingContributions:
        pendingContributions.length,

      totalContributions,

      totalSales,

      totalExpenses,

      netPosition:
        totalSales -
        totalExpenses,
    },
  });
}


/* ============================================================
   GENERIC KV READER
============================================================ */

async function getDataByPrefix(
  env,
  prefix
) {
  const list =
    await env.STALL_DATA.list({
      prefix,
    });

  const records = [];

  for (const key of list.keys) {
    const record =
      await env.STALL_DATA.get(
        key.name,
        "json"
      );

    if (record) {
      records.push(record);
    }
  }

  return records;
}
