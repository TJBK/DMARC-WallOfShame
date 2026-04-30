async function loadData() {
  const res = await fetch("../output/non_dmarc.json");
  const data = await res.json();

  const table = document.getElementById("table-body");

  data.forEach(item => {
    const row = document.createElement("tr");

    const statusText =
      item.status === "no_dmarc" ? "❌ No DMARC" : "⚠️ p=none";

    row.innerHTML = `
      <td>${item.name}</td>
      <td>${item.domain}</td>
      <td>${statusText}</td>
      <td>${new Date(item.last_checked).toLocaleString()}</td>
    `;

    table.appendChild(row);
  });
}

loadData();
