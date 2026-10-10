
const STALL_API_URL =
  "https://school-stall-commerce.priorityfixa.workers.dev";

const pinInput = document.getElementById("paymentPin");
const ordersList = document.getElementById("outstandingOrders");
const statusMessage = document.getElementById("statusMessage");
const paymentForm = document.getElementById("paymentForm");

const orderSelect = document.getElementById("orderId");
const amountInput = document.getElementById("paymentAmount");
const methodInput = document.getElementById("paymentMethod");
const referenceInput = document.getElementById("paymentReference");
const recordedByInput = document.getElementById("recordedBy");

let outstandingOrders = [];

function money(value) {
  return "KSh " + Number(value || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function showMessage(message, type = "info") {
  statusMessage.textContent = message;
  statusMessage.className = "message " + type;
}

async function apiRequest(path, options = {}) {
  const pin = pinInput.value.trim();

  if (!pin) {
    throw new Error("Enter the payment PIN first.");
  }

  const response = await fetch(STALL_API_URL + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Stall-Pin": pin,
      ...(options.headers || {})
    }
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    throw new Error(
      result.error || "The request could not be completed."
    );
  }

  return result;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function renderOrders() {
  ordersList.innerHTML = "";

  orderSelect.innerHTML =
    '<option value="">Select an outstanding order</option>';

  if (!outstandingOrders.length) {
    ordersList.innerHTML =
      '<p class="empty">No outstanding orders found.</p>';
    updateSelectedOrder();
    return;
  }

  for (const order of outstandingOrders) {
    const option = document.createElement("option");
    option.value = order.id;
    option.textContent =
      `${order.id} — ${order.customerName || order.sellerName || "Customer"} — ${money(order.balance)}`;

    orderSelect.appendChild(option);

    const card = document.createElement("article");
    card.className = "order-card";

    card.innerHTML = `
      <div>
        <strong>${escapeHtml(order.id)}</strong>
        <p>${escapeHtml(order.customerName || "Customer not specified")}</p>
        <small>${escapeHtml(order.sellerName || "Seller not specified")}</small>
      </div>
      <div class="order-amounts">
        <span>Total: ${money(order.total)}</span>
        <span>Paid: ${money(order.amountPaid)}</span>
        <strong>Balance: ${money(order.balance)}</strong>
        <small>${escapeHtml(order.paymentStatus)}</small>
      </div>
      <button type="button" class="choose-order"
        data-order-id="${escapeHtml(order.id)}">
        Record payment
      </button>
    `;

    card.querySelector("button").addEventListener("click", () => {
      orderSelect.value = order.id;
      updateSelectedOrder();
      paymentForm.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    ordersList.appendChild(card);
  }

  updateSelectedOrder();
}

function updateSelectedOrder() {
  const order = outstandingOrders.find(
    item => item.id === orderSelect.value
  );

  if (!order) {
    amountInput.removeAttribute("max");
    amountInput.value = "";
    document.getElementById("balanceHint").textContent =
      "Select an order to see its outstanding balance.";
    return;
  }

  amountInput.max = Number(order.balance).toFixed(2);

  document.getElementById("balanceHint").textContent =
    `Outstanding balance: ${money(order.balance)}. ` +
    `You may record a smaller amount for a partial payment.`;
}

async function loadOutstandingOrders() {
  try {
    showMessage("Loading outstanding orders…");

    const result = await apiRequest("/api/orders/unpaid");

    outstandingOrders = result.orders || [];
    renderOrders();

    showMessage(
      `Loaded ${outstandingOrders.length} outstanding order(s).`,
      "success"
    );
  } catch (error) {
    showMessage(error.message, "error");
  }
}

orderSelect.addEventListener("change", updateSelectedOrder);

paymentForm.addEventListener("submit", async event => {
  event.preventDefault();

  const orderId = orderSelect.value;

  if (!orderId) {
    showMessage("Select an order first.", "error");
    return;
  }

  const order = outstandingOrders.find(item => item.id === orderId);
  if (!order) {
    showMessage("Order not found in the current list. Reload the list.", "error");
    return;
  }

  const amount = Number(amountInput.value);

  if (!Number.isFinite(amount) || amount <= 0) {
    showMessage("Enter a valid payment amount.", "error");
    return;
  }

  if (amount > Number(order.balance) + 0.001) {
    showMessage("The amount cannot exceed the outstanding balance.", "error");
    return;
  }

  const method = methodInput.value;

  if (
    method === "mpesa" &&
    !window.confirm(
      "Confirm that you have verified the M-Pesa payment was actually received before recording it."
    )
  ) {
    return;
  }

  const submitButton = paymentForm.querySelector("button[type=submit]");
  submitButton.disabled = true;

  try {
    showMessage("Recording payment…");

    const result = await apiRequest(
      "/api/orders/" + encodeURIComponent(orderId) + "/payments",
      {
        method: "POST",
        body: JSON.stringify({
          amount,
          method,
          reference: referenceInput.value.trim(),
          recordedBy: recordedByInput.value.trim()
        })
      }
    );

    const updated = result.order;

    showMessage(
      `${result.message} Paid: ${money(updated.amountPaid)}. ` +
      `Remaining balance: ${money(updated.balance)}.`,
      "success"
    );

    paymentForm.reset();
    await loadOutstandingOrders();
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    submitButton.disabled = false;
  }
});

document.getElementById("refreshOrders").addEventListener(
  "click",
  loadOutstandingOrders
);
