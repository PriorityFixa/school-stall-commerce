/**
 * SCHOOL STALL COMMERCE API
 * Build 1 — Foundation
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

export default {
  async fetch(request, env) {
    try {
      if (request.method === "OPTIONS") {
        return cors();
      }

      const url = new URL(request.url);
      const path = url.pathname;

      /*
       * HEALTH CHECK
       */
      if (path === "/api/health" && request.method === "GET") {
        return json({
          success: true,
          service: "School Stall Commerce API",
          status: "online",
          version: "1.0.0",
          time: new Date().toISOString(),
        });
      }

      /*
       * ROOT
       */
      if (path === "/" && request.method === "GET") {
        return json({
          success: true,
          service: "School Stall Commerce API",
          message: "API is running.",
          endpoints: [
            "/api/health",
            "/api/products",
            "/api/students",
            "/api/contributions",
            "/api/orders",
            "/api/expenses",
            "/api/dashboard",
          ],
        });
      }

      /*
       * PRODUCTS
       */
      if (path === "/api/products" && request.method === "GET") {
        return getProducts(env);
      }

      /*
       * STUDENTS
       */
      if (path === "/api/students" && request.method === "GET") {
        return getStudents(env);
      }

      /*
       * CONTRIBUTIONS
       */
      if (path === "/api/contributions" && request.method === "GET") {
        return getContributions(env);
      }

      /*
       * ORDERS
       */
      if (path === "/api/orders" && request.method === "GET") {
        return getOrders(env);
      }

      /*
       * EXPENSES
       */
      if (path === "/api/expenses" && request.method === "GET") {
        return getExpenses(env);
      }

      /*
       * DASHBOARD
       */
      if (path === "/api/dashboard" && request.method === "GET") {
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


/* =========================================================
   PRODUCTS
========================================================= */

async function getProducts(env) {
  const list = await env.STALL_DATA.list({
    prefix: "PRODUCT:",
  });

  const products = [];

  for (const key of list.keys) {
    const product = await env.STALL_DATA.get(key.name, "json");

    if (product) {
      products.push(product);
    }
  }

  return json({
    success: true,
    products,
    count: products.length,
  });
}


/* =========================================================
   STUDENTS
========================================================= */

async function getStudents(env) {
  const list = await env.STALL_DATA.list({
    prefix: "STUDENT:",
  });

  const students = [];

  for (const key of list.keys) {
    const student = await env.STALL_DATA.get(key.name, "json");

    if (student) {
      students.push(student);
    }
  }

  return json({
    success: true,
    students,
    count: students.length,
  });
}


/* =========================================================
   CONTRIBUTIONS
========================================================= */

async function getContributions(env) {
  const list = await env.STALL_DATA.list({
    prefix: "CONTRIBUTION:",
  });

  const contributions = [];

  for (const key of list.keys) {
    const contribution = await env.STALL_DATA.get(
      key.name,
      "json"
    );

    if (contribution) {
      contributions.push(contribution);
    }
  }

  return json({
    success: true,
    contributions,
    count: contributions.length,
  });
}


/* =========================================================
   ORDERS
========================================================= */

async function getOrders(env) {
  const list = await env.STALL_DATA.list({
    prefix: "ORDER:",
  });

  const orders = [];

  for (const key of list.keys()) {
    const order = await env.STALL_DATA.get(
      key.name,
      "json"
    );

    if (order) {
      orders.push(order);
    }
  }

  return json({
    success: true,
    orders,
    count: orders.length,
  });
}


/* =========================================================
   EXPENSES
========================================================= */

async function getExpenses(env) {
  const list = await env.STALL_DATA.list({
    prefix: "EXPENSE:",
  });

  const expenses = [];

  for (const key of list.keys()) {
    const expense = await env.STALL_DATA.get(
      key.name,
      "json"
    );

    if (expense) {
      expenses.push(expense);
    }
  }

  return json({
    success: true,
    expenses,
    count: expenses.length,
  });
}


/* =========================================================
   DASHBOARD
========================================================= */

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

  const totalContributions = contributions.reduce(
    (sum, item) => sum + Number(item.totalValue || 0),
    0
  );

  const totalSales = orders.reduce(
    (sum, item) => sum + Number(item.total || 0),
    0
  );

  const totalExpenses = expenses.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  );

  return json({
    success: true,

    dashboard: {
      students: students.length,
      products: products.length,
      orders: orders.length,

      totalContributions,
      totalSales,
      totalExpenses,

      netPosition:
        totalSales -
        totalExpenses,
    },
  });
}


/* =========================================================
   GENERIC KV READER
========================================================= */

async function getDataByPrefix(env, prefix) {
  const list = await env.STALL_DATA.list({
    prefix,
  });

  const records = [];

  for (const key of list.keys) {
    const record = await env.STALL_DATA.get(
      key.name,
      "json"
    );

    if (record) {
      records.push(record);
    }
  }

  return records;
}
