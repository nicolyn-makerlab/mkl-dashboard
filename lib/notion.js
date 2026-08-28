const { Client } = require("@notionhq/client");

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Notion split "databases" into containers + data sources as of API
// version 2025-09-03. The IDs in .env are data source IDs, so we query
// via notion.dataSources.query, not the older notion.databases.query.
async function queryAll(dataSourceId) {
  const results = [];
  let cursor = undefined;
  do {
    const res = await notion.dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: cursor,
      page_size: 100,
    });
    results.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return results;
}

function plainText(richTextArray) {
  if (!Array.isArray(richTextArray)) return "";
  return richTextArray.map((t) => t.plain_text).join("");
}

function getProp(page, name, type) {
  const prop = page.properties[name];
  if (!prop) return null;
  switch (type) {
    case "title":
      return plainText(prop.title);
    case "text":
      return plainText(prop.rich_text);
    case "select":
      return prop.select ? prop.select.name : null;
    case "status":
      return prop.status ? prop.status.name : null;
    case "date":
      return prop.date ? prop.date.start : null;
    case "email":
      return prop.email || null;
    case "relation":
      return (prop.relation || []).map((r) => r.id);
    default:
      return null;
  }
}

async function fetchCompanies() {
  const pages = await queryAll(process.env.NOTION_COMPANIES_DS);
  return pages.map((p) => ({
    id: p.id,
    name: getProp(p, "Name", "title"),
    operations: getProp(p, "Operations", "select"),
    contractDates: getProp(p, "Contract Length & Dates", "text"),
    url: p.url,
  }));
}

async function fetchClientsCRM() {
  const pages = await queryAll(process.env.NOTION_CLIENTS_CRM_DS);
  return pages.map((p) => ({
    id: p.id,
    name: getProp(p, "Name", "title"),
    email: getProp(p, "Email", "email"),
    lastContact: getProp(p, "Last Contact", "date"),
    companyIds: getProp(p, "Company", "relation"),
  }));
}

async function fetchTasks() {
  const pages = await queryAll(process.env.NOTION_TASKS_DS);
  return pages.map((p) => ({
    id: p.id,
    name: getProp(p, "Name", "title"),
    status: getProp(p, "Status", "status"),
    owner: getProp(p, "Owner", "select"),
    dueDate: getProp(p, "Due date", "date"),
    companyIds: getProp(p, "Company", "relation"),
  }));
}

module.exports = { fetchCompanies, fetchClientsCRM, fetchTasks };