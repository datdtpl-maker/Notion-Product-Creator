const { Client } = require("@notionhq/client");
const token = process.env.NOTION_API_KEY;
if (!token) throw new Error("Set NOTION_API_KEY before running this utility.");
const notion = new Client({ auth: token });

async function getPageBlocks() {
  const pageId = "39970655a9aa807f815ddd6420707692";
  const response = await notion.blocks.children.list({
    block_id: pageId,
    page_size: 100,
  });
  
  // Format to readable text/markdown
  for (const block of response.results) {
    if (block.type === 'paragraph') {
      const texts = block.paragraph.rich_text.map(t => t.plain_text).join('');
      console.log(texts);
    } else if (block.type === 'heading_1') {
      const texts = block.heading_1.rich_text.map(t => t.plain_text).join('');
      console.log('# ' + texts);
    } else if (block.type === 'heading_2') {
      const texts = block.heading_2.rich_text.map(t => t.plain_text).join('');
      console.log('## ' + texts);
    } else if (block.type === 'heading_3') {
      const texts = block.heading_3.rich_text.map(t => t.plain_text).join('');
      console.log('### ' + texts);
    } else if (block.type === 'bulleted_list_item') {
      const texts = block.bulleted_list_item.rich_text.map(t => t.plain_text).join('');
      console.log('* ' + texts);
    } else if (block.type === 'numbered_list_item') {
      const texts = block.numbered_list_item.rich_text.map(t => t.plain_text).join('');
      console.log('1. ' + texts);
    } else {
      console.log(`[Block: ${block.type}]`);
    }
  }
}
getPageBlocks().catch(console.error);
