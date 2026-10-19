/**
 * The picture in a shared block's link card (X, iMessage, Slack read `og:image` and draw it). A link previewer
 * runs no script, so a block has to be drawn by a browser first: Cloudflare Browser Rendering opens the shared
 * page in its card view (`/b/<id>?card`: the block alone, on a 1200×630 ground) and answers a screenshot.
 *
 * Made when a block is shared or a shared block changes, kept in `block_cards` (one per block, gone with it), and
 * made again on the next ask when the block changed since. Nothing is made without the Cloudflare secrets.
 */
import { gql } from "../db/hasura.ts";
import { env } from "../env.ts";

const WIDTH = 1200;
const HEIGHT = 630;
const making = new Map<string, Promise<Buffer | null>>();

/** Asks Cloudflare for a screenshot of the block's card view, or null when it cannot be made. */
async function screenshot(id: string): Promise<Buffer | null> {
  if (!env.cloudflareAccount || !env.cloudflareBrowserToken) return null;
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.cloudflareAccount}/browser-rendering/screenshot`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.cloudflareBrowserToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      url: `${env.publicUrl}/b/${id}?card`,
      viewport: { width: WIDTH, height: HEIGHT },
      // the card view sets data-card-ready once the block has drawn itself and its animations had a moment
      waitForSelector: { selector: "[data-card-ready]", timeout: 20000 },
      gotoOptions: { waitUntil: "networkidle0", timeout: 30000 },
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok || !(response.headers.get("content-type") ?? "").startsWith("image/")) {
    console.warn(`card ${id}: Cloudflare answered ${response.status} ${(await response.text().catch(() => "")).slice(0, 200)}`);
    return null;
  }
  return Buffer.from(await response.arrayBuffer());
}

/** Makes the card again and keeps it. Two asks for the same block at the same moment make one. */
export function makeCard(id: string): Promise<Buffer | null> {
  if (!making.has(id)) {
    const made = screenshot(id)
      .then(async (png) => {
        if (png) {
          await gql(
            `mutation($card: block_cards_insert_input!) { insert_block_cards_one(object: $card, on_conflict: {constraint: block_cards_pkey, update_columns: [png, made_at]}) { block_id } }`,
            { card: { block_id: id, png: png.toString("base64"), made_at: new Date().toISOString() } },
            "admin",
          );
        }
        return png;
      })
      .catch((error: Error) => (console.warn(`card ${id}: ${error.message}`), null))
      .finally(() => making.delete(id));
    making.set(id, made);
  }
  return making.get(id)!;
}

/** The card of a shared block: the one kept, or a new one when there is none or the block changed since. */
export async function cardOf(id: string, updatedAt: string): Promise<Buffer | null> {
  const data = await gql<{ block_cards_by_pk: { png: string; made_at: string } | null }>(`query($id: uuid!) { block_cards_by_pk(block_id: $id) { png made_at } }`, { id }, "admin");
  const kept = data.block_cards_by_pk;
  if (kept && new Date(kept.made_at) >= new Date(updatedAt)) return Buffer.from(kept.png, "base64");
  return (await makeCard(id)) ?? (kept ? Buffer.from(kept.png, "base64") : null);
}
