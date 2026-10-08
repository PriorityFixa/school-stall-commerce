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


/* ============================================================
   CORS
============================================================ */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};


/* ============================================================
   MAIN WORKER
============================================================ */

export default {

  async fetch(request, env) {

    const url = new URL(request.url);

    const path = url.pathname;

    const method = request.method;


    /* --------------------------------------------------------
       CORS PREFLIGHT
    -------------------------------------------------------- */

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

      if (
        path === "/" &&
        method === "GET"
      ) {

        return json({

          success: true,

          service:
            "School Stall Commerce API",

          status:
            "online"

        });

      }


      if (
        path === "/api/health" &&
        method === "GET"
      ) {

        return json({

          success: true,

          status:
            "healthy",

          service:
            "school-stall-commerce"

        });

      }


      /* ======================================================
         STUDENTS
      ====================================================== */

      if (
        path === "/api/students" &&
        method === "GET"
      ) {

        return getStudents(env);

      }


      if (
        path === "/api/students" &&
        method === "POST"
      ) {

        return createStudent(
          request,
          env
        );

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

        return createContribution(
          request,
          env
        );

      }


      if (
        path.startsWith(
          "/api/contributions/"
        ) &&
        path.endsWith("/approve") &&
        method === "POST"
      ) {

        const contributionId =
          path.split("/")[3];


        return approveContribution(
          contributionId,
          request,
          env
        );

      }


      if (
        path.startsWith(
          "/api/contributions/"
        ) &&
        path.endsWith("/reject") &&
        method === "POST"
      ) {

        const contributionId =
          path.split("/")[3];


        return rejectContribution(
          contributionId,
          request,
          env
        );

      }


      /* ======================================================
         PRODUCTS
      ====================================================== */

      if (
        path === "/api/products" &&
        method === "GET"
      ) {

        return getProducts(env);

      }


      if (
        path === "/api/products" &&
        method === "POST"
      ) {

        return createProduct(
          request,
          env
        );

      }


      if (
        path.startsWith("/api/products/") &&
        method === "PUT"
      ) {

        const productId =
          path.split("/")[3];


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
        path === "/api/inventory" &&
        method === "GET"
      ) {

        return getInventoryHistory(env);

      }


      if (
        path.startsWith("/api/inventory/") &&
        path.endsWith("/adjust") &&
        method === "POST"
      ) {

        const productId =
          path.split("/")[3];


        return adjustInventory(
          productId,
          request,
          env
        );

      }


      /* ======================================================
         ORDERS
      ====================================================== */

      if (
        path === "/api/orders" &&
        method === "GET"
      ) {

        return getOrders(env);

      }


      if (
        path === "/api/orders" &&
        method === "POST"
      ) {

        return createOrder(
          request,
          env
        );

      }


      /* ======================================================
         EXPENSES
      ====================================================== */

      if (
        path === "/api/expenses" &&
        method === "GET"
      ) {

        return getExpenses(env);

      }


      /* ======================================================
         DASHBOARD
      ====================================================== */

      if (
        path === "/api/dashboard" &&
        method === "GET"
      ) {

        return getDashboard(env);

      }


      /* ======================================================
         ROUTE NOT FOUND
      ====================================================== */

      return json(

        {
          success: false,

          error:
            "Route not found",

          path

        },

        404

      );


    } catch (error) {

      console.error(
        "Worker error:",
        error
      );


      return json(

        {
          success: false,

          error:
            error.message ||
            "Internal server error"

        },

        500

      );

    }

  }

};


/* ============================================================
   RESPONSE HELPER
============================================================ */

function json(
  data,
  status = 200
) {

  return new Response(

    JSON.stringify(
      data,
      null,
      2
    ),

    {
      status,

      headers:
        CORS_HEADERS

    }

  );

}


/* ============================================================
   REQUEST JSON HELPER
============================================================ */

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

  return (

    `${prefix}-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase()}`

  );

}


/* ============================================================
   KV PREFIX READER
============================================================ */

async function getDataByPrefix(
  env,
  prefix
) {

  const result =
    await env.STALL_DATA.list({
      prefix
    });


  const records = [];


  for (
    const key of result.keys
  ) {

    const value =
      await env.STALL_DATA.get(
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

  const students =
    await getDataByPrefix(
      env,
      "STUDENT:"
    );


  students.sort(
    (a, b) =>
      a.name.localeCompare(
        b.name
      )
  );


  return json({

    success: true,

    students,

    count:
      students.length

  });

}


/* ============================================================
   CREATE STUDENT
============================================================ */

async function createStudent(
  request,
  env
) {

  const body =
    await readJson(request);


  const name =
    String(
      body.name || ""
    ).trim();


  const role =
    String(
      body.role || "Member"
    ).trim();


  if (!name) {

    return json(

      {
        success: false,

        error:
          "Student name is required"
      },

      400

    );

  }


  const id =
    createId("STU");


  const student = {

    id,

    name,

    role,

    status:
      "active",

    createdAt:
      new Date().toISOString()

  };


  await env.STALL_DATA.put(

    `STUDENT:${id}`,

    JSON.stringify(student)

  );


  return json(

    {
      success: true,

      student

    },

    201

  );

}


/* ============================================================
   CONTRIBUTIONS
============================================================ */

async function getContributions(env) {

  const contributions =
    await getDataByPrefix(
      env,
      "CONTRIBUTION:"
    );


  contributions.sort(

    (a, b) =>
      new Date(
        b.submittedAt
      ) -
      new Date(
        a.submittedAt
      )

  );


  return json({

    success: true,

    contributions,

    count:
      contributions.length

  });

}


/* ============================================================
   CREATE CONTRIBUTION
============================================================ */

async function createContribution(
  request,
  env
) {

  const body =
    await readJson(request);


  const studentId =
    String(
      body.studentId || ""
    ).trim();


  const type =
    String(
      body.type || ""
    ).trim()
    .toLowerCase();


  const description =
    String(
      body.description || ""
    ).trim();


  const agreedValue =
    Number(
      body.agreedValue
    );


  if (!studentId) {

    return json(

      {
        success: false,

        error:
          "Student is required"

      },

      400

    );

  }


  if (
    ![
      "cash",
      "goods",
      "labour",
      "service"
    ].includes(type)
  ) {

    return json(

      {
        success: false,

        error:
          "Invalid contribution type"

      },

      400

    );

  }


  if (
    !Number.isFinite(
      agreedValue
    ) ||
    agreedValue <= 0
  ) {

    return json(

      {
        success: false,

        error:
          "Agreed value must be greater than zero"

      },

      400

    );

  }


  const student =
    await env.STALL_DATA.get(

      `STUDENT:${studentId}`,

      "json"

    );


  if (!student) {

    return json(

      {
        success: false,

        error:
          "Student not found"

      },

      404

    );

  }


  const id =
    createId("CON");


  const contribution = {

    id,

    studentId,

    studentName:
      student.name,

    type,

    description,

    agreedValue,

    status:
      "pending",

    submittedAt:
      new Date().toISOString(),

    approvedAt:
      null,

    approvedBy:
      null,

    rejectedAt:
      null,

    rejectedBy:
      null

  };


  await env.STALL_DATA.put(

    `CONTRIBUTION:${id}`,

    JSON.stringify(
      contribution
    )

  );


  return json(

    {
      success: true,

      contribution

    },

    201

  );

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

        error:
          "Contribution not found"

      },

      404

    );

  }


  if (
    contribution.status !==
    "pending"
  ) {

    return json(

      {
        success: false,

        error:
          `Contribution is already ${contribution.status}`

      },

      400

    );

  }


  const body =
    await readJson(request);


  contribution.status =
    "approved";


  contribution.approvedAt =
    new Date().toISOString();


  contribution.approvedBy =
    body.approvedBy ||
    "Admin";


  await env.STALL_DATA.put(

    key,

    JSON.stringify(
      contribution
    )

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

        error:
          "Contribution not found"

      },

      404

    );

  }


  if (
    contribution.status !==
    "pending"
  ) {

    return json(

      {
        success: false,

        error:
          `Contribution is already ${contribution.status}`

      },

      400

    );

  }


  const body =
    await readJson(request);


  contribution.status =
    "rejected";


  contribution.rejectedAt =
    new Date().toISOString();


  contribution.rejectedBy =
    body.rejectedBy ||
    "Admin";


  await env.STALL_DATA.put(

    key,

    JSON.stringify(
      contribution
    )

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
        contribution.status ===
        "approved"

    );


  const totals = {};


  for (
    const contribution
    of approved
  ) {

    if (
      !totals[
        contribution.studentId
      ]
    ) {

      totals[
        contribution.studentId
      ] = {

        studentId:
          contribution.studentId,

        studentName:
          contribution.studentName,

        contribution:
          0

      };

    }


    totals[
      contribution.studentId
    ].contribution +=
      Number(
        contribution.agreedValue
      );

  }


  const totalApprovedContribution =
    Object.values(totals)
      .reduce(

        (sum, item) =>
          sum +
          item.contribution,

        0

      );


  const ownership =
    Object.values(totals)
      .map(item => ({

        ...item,

        ownershipPercentage:

          totalApprovedContribution >
          0

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


  products.sort(

    (a, b) =>
      a.name.localeCompare(
        b.name
      )

  );


  return json({

    success: true,

    products,

    count:
      products.length

  });

}


/* ============================================================
   CREATE PRODUCT
============================================================ */

async function createProduct(
  request,
  env
) {

  const body =
    await readJson(request);


  const name =
    String(
      body.name || ""
    ).trim();


  const sellingPrice =
    Number(
      body.sellingPrice
    );


  const costPrice =
    Number(
      body.costPrice || 0
    );


  const openingStock =
    Number(
      body.openingStock || 0
    );


  const reorderLevel =
    Number(
      body.reorderLevel || 0
    );


  if (!name) {

    return json(

      {
        success: false,

        error:
          "Product name is required"

      },

      400

    );

  }


  if (
    !Number.isFinite(
      sellingPrice
    ) ||
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
    !Number.isFinite(
      costPrice
    ) ||
    costPrice < 0
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


  if (
    !Number.isFinite(
      openingStock
    ) ||
    openingStock < 0
  ) {

    return json(

      {
        success: false,

        error:
          "Invalid opening stock"

      },

      400

    );

  }


  if (
    !Number.isFinite(
      reorderLevel
    ) ||
    reorderLevel < 0
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


  const id =
    createId("PROD");


  const now =
    new Date().toISOString();


  const product = {

    id,

    name,

    sellingPrice,

    costPrice,

    stockQuantity:
      openingStock,

    reorderLevel,

    active:
      true,

    createdAt:
      now,

    updatedAt:
      now

  };


  await env.STALL_DATA.put(

    `PRODUCT:${id}`,

    JSON.stringify(product)

  );


  /*
   * If there is opening stock,
   * record it in inventory history.
   */

  if (openingStock > 0) {

    const inventoryRecord = {

      id:
        createId("INV"),

      productId:
        id,

      productName:
        name,

      change:
        openingStock,

      previousStock:
        0,

      newStock:
        openingStock,

      reason:
        "Opening stock",

      createdAt:
        now

    };


    await env.STALL_DATA.put(

      `INVENTORY:${inventoryRecord.id}`,

      JSON.stringify(
        inventoryRecord
      )

    );

  }


  return json(

    {
      success: true,

      product

    },

    201

  );

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

        error:
          "Product not found"

      },

      404

    );

  }


  const body =
    await readJson(request);


  if (
    body.name !== undefined
  ) {

    const name =
      String(
        body.name
      ).trim();


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


    product.name =
      name;

  }


  if (
    body.sellingPrice !==
    undefined
  ) {

    const price =
      Number(
        body.sellingPrice
      );


    if (
      !Number.isFinite(
        price
      ) ||
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


    product.sellingPrice =
      price;

  }


  if (
    body.costPrice !==
    undefined
  ) {

    const price =
      Number(
        body.costPrice
      );


    if (
      !Number.isFinite(
        price
      ) ||
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


    product.costPrice =
      price;

  }


  if (
    body.reorderLevel !==
    undefined
  ) {

    const level =
      Number(
        body.reorderLevel
      );


    if (
      !Number.isFinite(
        level
      ) ||
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


    product.reorderLevel =
      level;

  }


  if (
    body.active !==
    undefined
  ) {

    product.active =
      Boolean(
        body.active
      );

  }


  product.updatedAt =
    new Date().toISOString();


  await env.STALL_DATA.put(

    key,

    JSON.stringify(
      product
    )

  );


  return json({

    success: true,

    product

  });

}


/* ============================================================
   MANUAL INVENTORY ADJUSTMENT
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

        error:
          "Product not found"

      },

      404

    );

  }


  const body =
    await readJson(request);


  const change =
    Number(
      body.change
    );


  const reason =
    String(

      body.reason ||
      "Manual adjustment"

    ).trim();


  if (
    !Number.isFinite(
      change
    ) ||
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


  const previousStock =
    Number(
      product.stockQuantity || 0
    );


  const newStock =
    previousStock +
    change;


  if (
    newStock < 0
  ) {

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

    JSON.stringify(
      product
    )

  );


  const inventoryRecord = {

    id:
      createId("INV"),

    productId,

    productName:
      product.name,

    change,

    previousStock,

    newStock,

    reason,

    createdAt:
      new Date().toISOString()

  };


  await env.STALL_DATA.put(

    `INVENTORY:${inventoryRecord.id}`,

    JSON.stringify(
      inventoryRecord
    )

  );


  return json({

    success: true,

    product,

    inventoryRecord

  });

}


/* ============================================================
   INVENTORY HISTORY
============================================================ */

async function getInventoryHistory(
  env
) {

  const records =
    await getDataByPrefix(
      env,
      "INVENTORY:"
    );


  records.sort(

    (a, b) =>
      new Date(
        b.createdAt
      ) -
      new Date(
        a.createdAt
      )

  );


  return json({

    success: true,

    inventory:
      records,

    count:
      records.length

  });

}


/* ============================================================
   CREATE ORDER
============================================================ */

async function createOrder(
  request,
  env
) {

  const body =
    await readJson(request);


  /* ----------------------------------------------------------
     CUSTOMER / SELLER DETAILS
  ---------------------------------------------------------- */

  const sellerName =
    String(
      body.sellerName || ""
    ).trim();


  const customerName =
    String(
      body.customerName || ""
    ).trim();


  const customerPhone =
    String(
      body.customerPhone || ""
    ).trim();


  const paymentMethod =
    String(
      body.paymentMethod ||
      "cash"
    )
      .trim()
      .toLowerCase();


  const items =
    Array.isArray(
      body.items
    )
      ? body.items
      : [];


  /* ----------------------------------------------------------
     VALIDATION
  ---------------------------------------------------------- */

  if (!sellerName) {

    return json(

      {
        success: false,

        error:
          "Seller name is required"

      },

      400

    );

  }


  if (!items.length) {

    return json(

      {
        success: false,

        error:
          "Order must contain at least one product"

      },

      400

    );

  }


  const allowedPaymentMethods = [

    "cash",

    "mpesa",

    "credit"

  ];


  if (
    !allowedPaymentMethods.includes(
      paymentMethod
    )
  ) {

    return json(

      {
        success: false,

        error:
          "Invalid payment method"

      },

      400

    );

  }


  /* ----------------------------------------------------------
     PREPARE ORDER ITEMS
  ---------------------------------------------------------- */

  const orderItems = [];

  let total = 0;


  /*
   * IMPORTANT:
   *
   * We do NOT trust:
   *
   * - price
   * - product name
   * - total
   *
   * from the browser.
   *
   * The Worker gets these values
   * directly from KV.
   */


  for (
    const requestedItem
    of items
  ) {

    const productId =
      String(
        requestedItem.productId ||
        ""
      ).trim();


    const quantity =
      Number(
        requestedItem.quantity
      );


    if (!productId) {

      return json(

        {
          success: false,

          error:
            "A product ID is missing"

        },

        400

      );

    }


    if (
      !Number.isInteger(
        quantity
      ) ||
      quantity <= 0
    ) {

      return json(

        {
          success: false,

          error:
            "Product quantity must be a whole number greater than zero"

        },

        400

      );

    }


    /* --------------------------------------------------------
       LOAD PRODUCT
    -------------------------------------------------------- */

    const product =
      await env.STALL_DATA.get(

        `PRODUCT:${productId}`,

        "json"

      );


    if (!product) {

      return json(

        {
          success: false,

          error:
            `Product not found: ${productId}`

        },

        404

      );

    }


    if (
      product.active ===
      false
    ) {

      return json(

        {
          success: false,

          error:
            `${product.name} is no longer available`

        },

        400

      );

    }


    /* --------------------------------------------------------
       CHECK STOCK
    -------------------------------------------------------- */

    const currentStock =
      Number(
        product.stockQuantity ||
        0
      );


    if (
      quantity >
      currentStock
    ) {

      return json(

        {
          success: false,

          error:
            `Not enough stock for ${product.name}. Available: ${currentStock}`

        },

        400

      );

    }


    /* --------------------------------------------------------
       SERVER-SIDE PRICE
    -------------------------------------------------------- */

    const unitPrice =
      Number(
        product.sellingPrice
      );


    if (
      !Number.isFinite(
        unitPrice
      ) ||
      unitPrice <= 0
    ) {

      return json(

        {
          success: false,

          error:
            `Invalid selling price for ${product.name}`

        },

        400

      );

    }


    const lineTotal =
      unitPrice *
      quantity;


    total +=
      lineTotal;


    orderItems.push({

      productId:
        product.id,

      productName:
        product.name,

      quantity,

      unitPrice,

      lineTotal,

      costPrice:
        Number(
          product.costPrice ||
          0
        )

    });

  }


  /* ----------------------------------------------------------
     CREATE ORDER
  ---------------------------------------------------------- */

  const orderId =
    createId("ORD");


  const now =
    new Date().toISOString();


  /*
   * For the first version:
   *
   * cash    -> paid
   * mpesa   -> pending
   * credit  -> unpaid
   *
   * M-Pesa will be connected properly later.
   */

  let paymentStatus =
    "PENDING";


  if (
    paymentMethod ===
    "cash"
  ) {

    paymentStatus =
      "PAID";

  }


  if (
    paymentMethod ===
    "credit"
  ) {

    paymentStatus =
      "UNPAID";

  }


  const order = {

    id:
      orderId,

    sellerName,

    customerName,

    customerPhone,

    paymentMethod,

    items:
      orderItems,

    total,

    currency:
      "KES",

    status:
      "completed",

    paymentStatus,

    createdAt:
      now,

    updatedAt:
      now

  };


  /* ----------------------------------------------------------
     SAVE ORDER
  ---------------------------------------------------------- */

  await env.STALL_DATA.put(

    `ORDER:${orderId}`,

    JSON.stringify(
      order
    )

  );


  /* ----------------------------------------------------------
     REDUCE STOCK
  ---------------------------------------------------------- */

  for (
    const item
    of orderItems
  ) {

    const key =
      `PRODUCT:${item.productId}`;


    const product =
      await env.STALL_DATA.get(
        key,
        "json"
      );


    if (!product) {

      return json(

        {
          success: false,

          error:
            "Product disappeared during order processing"

        },

        500

      );

    }


    const previousStock =
      Number(
        product.stockQuantity ||
        0
      );


    const newStock =
      previousStock -
      item.quantity;


    if (
      newStock < 0
    ) {

      return json(

        {
          success: false,

          error:
            `Inventory conflict for ${product.name}. Please retry the order.`

        },

        409

      );

    }


    product.stockQuantity =
      newStock;


    product.updatedAt =
      new Date().toISOString();


    await env.STALL_DATA.put(

      key,

      JSON.stringify(
        product
      )

    );


    /* --------------------------------------------------------
       INVENTORY HISTORY
    -------------------------------------------------------- */

    const inventoryRecord = {

      id:
        createId("INV"),

      productId:
        product.id,

      productName:
        product.name,

      change:
        -item.quantity,

      previousStock,

      newStock,

      reason:
        `Sale ${orderId}`,

      orderId,

      createdAt:
        now

    };


    await env.STALL_DATA.put(

      `INVENTORY:${inventoryRecord.id}`,

      JSON.stringify(
        inventoryRecord
      )

    );

  }


  /* ----------------------------------------------------------
     RESPONSE
  ---------------------------------------------------------- */

  return json(

    {

      success: true,

      message:
        "Order created successfully",

      order

    },

    201

  );

}


/* ============================================================
   GET ORDERS
============================================================ */

async function getOrders(env) {

  const orders =
    await getDataByPrefix(
      env,
      "ORDER:"
    );


  orders.sort(

    (a, b) =>
      new Date(
        b.createdAt
      ) -
      new Date(
        a.createdAt
      )

  );


  return json({

    success: true,

    orders,

    count:
      orders.length

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
      new Date(
        b.createdAt
      ) -
      new Date(
        a.createdAt
      )

  );


  return json({

    success: true,

    expenses,

    count:
      expenses.length

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


  /* ----------------------------------------------------------
     CONTRIBUTIONS
  ---------------------------------------------------------- */

  const approvedContributions =
    contributions.filter(

      contribution =>
        contribution.status ===
        "approved"

    );


  const pendingContributions =
    contributions.filter(

      contribution =>
        contribution.status ===
        "pending"

    );


  const totalContributions =
    approvedContributions.reduce(

      (sum, contribution) =>

        sum +
        Number(
          contribution.agreedValue ||
          0
        ),

      0

    );


  /* ----------------------------------------------------------
     SALES
  ---------------------------------------------------------- */

  const completedOrders =
    orders.filter(

      order =>
        order.status ===
        "completed"

    );


  const totalSales =
    completedOrders.reduce(

      (sum, order) =>

        sum +
        Number(
          order.total ||
          0
        ),

      0

    );


  /* ----------------------------------------------------------
     COST OF GOODS SOLD
  ---------------------------------------------------------- */

  const totalCostOfGoodsSold =
    completedOrders.reduce(

      (sum, order) => {

        const orderCost =
          Array.isArray(
            order.items
          )

            ? order.items.reduce(

                (
                  itemSum,
                  item
                ) =>

                  itemSum +

                  (
                    Number(
                      item.costPrice ||
                      0
                    ) *

                    Number(
                      item.quantity ||
                      0
                    )
                  ),

                0

              )

            : 0;


        return (
          sum +
          orderCost
        );

      },

      0

    );


  /* ----------------------------------------------------------
     EXPENSES
  ---------------------------------------------------------- */

  const totalExpenses =
    expenses.reduce(

      (sum, expense) =>

        sum +
        Number(
          expense.amount ||
          0
        ),

      0

    );


  /* ----------------------------------------------------------
     PROFIT
  ---------------------------------------------------------- */

  const grossProfit =
    totalSales -
    totalCostOfGoodsSold;


  const netProfit =
    grossProfit -
    totalExpenses;


  /* ----------------------------------------------------------
     STOCK
  ---------------------------------------------------------- */

  const totalStockUnits =
    products.reduce(

      (sum, product) =>

        sum +
        Number(
          product.stockQuantity ||
          0
        ),

      0

    );


  const lowStockProducts =
    products.filter(

      product =>

        Number(
          product.stockQuantity ||
          0
        ) <=

        Number(
          product.reorderLevel ||
          0
        )

    );


  /* ----------------------------------------------------------
     RETURN DASHBOARD
  ---------------------------------------------------------- */

  return json({

    success: true,

    students:
      students.length,

    products:
      products.length,

    activeProducts:
      products.filter(
        product =>
          product.active !== false
      ).length,

    orders:
      orders.length,

    approvedContributions:
      totalContributions,

    pendingContributions:
      pendingContributions.length,

    totalSales,

    totalCostOfGoodsSold,

    totalExpenses,

    grossProfit,

    netProfit,

    netPosition:
      totalSales -
      totalExpenses,

    totalStockUnits,

    lowStockProducts:
      lowStockProducts.length

  });

}
