function readTitle(page, propertyName) {
  return (page.properties?.[propertyName]?.title || [])
    .map((item) => item.plain_text || item.text?.content || "")
    .join("")
    .trim();
}

async function listFacebookProductsByStatus(notion, databaseId, status) {
  const products = [];
  let startCursor;

  do {
    const response = await notion.databases.query({
      database_id: databaseId,
      page_size: 100,
      start_cursor: startCursor,
      filter: {
        property: "Facebook",
        select: { equals: status }
      }
    });

    for (const page of response.results) {
      const productName = readTitle(page, "Tên sản phẩm");
      if (!productName) continue;
      products.push({
        pageId: page.id,
        productName,
        webUrl: page.properties["Link web"]?.url || "",
        mediaUrl: page.properties["Media sản phẩm"]?.url || ""
      });
    }

    startCursor = response.has_more ? response.next_cursor : undefined;
  } while (startCursor);

  return products.sort((left, right) => left.productName.localeCompare(right.productName, "vi"));
}

async function markFacebookProductsAsPublished(notion, products) {
  let updatedCount = 0;
  const failures = [];

  for (const product of products) {
    try {
      await notion.pages.update({
        page_id: product.pageId,
        properties: { Facebook: { select: { name: "Đã đăng" } } }
      });
      updatedCount += 1;
    } catch (error) {
      failures.push({ pageId: product.pageId, productName: product.productName, error: error.message });
    }
  }

  return { updatedCount, failures };
}

module.exports = { listFacebookProductsByStatus, markFacebookProductsAsPublished, readTitle };
