-- The picture in a shared block's link card (X, iMessage, Slack): a screenshot of the block, made by the mcp
-- when the block is shared or changed, and served at /api/blocks/<id>/card.png. Read and written by the mcp only.
CREATE TABLE block_cards (
  block_id uuid PRIMARY KEY REFERENCES blocks(id) ON DELETE CASCADE,
  png text NOT NULL,
  made_at timestamptz NOT NULL DEFAULT now()
);
