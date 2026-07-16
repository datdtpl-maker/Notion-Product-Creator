const assert = require("node:assert/strict");
const test = require("node:test");

const {
  listFacebookProductsByStatus,
  markFacebookProductsAsPublished
} = require("../lib/facebook-status");

function createPage(id, name) {
  return {
    id,
    properties: {
      "Tên sản phẩm": { title: [{ plain_text: name }] },
      "Link web": { url: "" },
      "Media sản phẩm": { url: "" }
    }
  };
}

test("lists every Notion product with the Chờ đăng Facebook status", async () => {
  const queryCalls = [];
  const notion = {
    databases: {
      query: async (input) => {
        queryCalls.push(input);
        if (!input.start_cursor) {
          return { results: [createPage("page-1", "Sản phẩm A")], has_more: true, next_cursor: "next" };
        }
        return { results: [createPage("page-2", "Sản phẩm B")], has_more: false, next_cursor: null };
      }
    }
  };

  const products = await listFacebookProductsByStatus(notion, "database-id", "Chờ đăng");

  assert.deepEqual(products.map((product) => product.productName), ["Sản phẩm A", "Sản phẩm B"]);
  assert.equal(queryCalls.length, 2);
  assert.deepEqual(queryCalls[0].filter, {
    property: "Facebook",
    select: { equals: "Chờ đăng" }
  });
});

test("marks confirmed waiting products as Đã đăng", async () => {
  const updates = [];
  const notion = {
    pages: {
      update: async (input) => {
        updates.push(input);
      }
    }
  };

  const result = await markFacebookProductsAsPublished(notion, [
    { pageId: "page-1", productName: "Sản phẩm A" },
    { pageId: "page-2", productName: "Sản phẩm B" }
  ]);

  assert.equal(result.updatedCount, 2);
  assert.deepEqual(updates, [
    { page_id: "page-1", properties: { Facebook: { select: { name: "Đã đăng" } } } },
    { page_id: "page-2", properties: { Facebook: { select: { name: "Đã đăng" } } } }
  ]);
});
