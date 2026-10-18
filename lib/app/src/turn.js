// One turn of a chat with a model that has tools: the loop every app's chat runs, without the model call, the
// tools or the words, which are the app's. Same shape as tags' Ask and Potion's Talk:
//
//   - The server keeps nothing: the conversation travels with each request (`messages`), as the last turn
//     returned it. The system prompt is the app's, given at each turn; one sent by the client is dropped.
//   - A tool that reads runs at once. One marked `write` does not: the turn stops and hands it back as
//     `pending`, and it runs only when the next request approves it. Declined, the model is told not to retry.
//   - A tool that fails answers with its error, which the model can act on.
//
// Messages are in the shape of OpenRouter's chat completions (OpenAI's): { role, content, tool_calls,
// tool_call_id }.

const parseArgs = (raw) => {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

/**
 * @param {object} options
 * @param {(request: { messages: object[] }) => Promise<{ message: object, model?: string, cost?: number }>} options.converse
 *   one call to the model with the conversation; the app gives it the tools and its key
 * @param {{ name: string, write?: boolean }[]} options.tools the tools the model was given
 * @param {(name: string, args: object) => Promise<unknown>} options.run runs one tool and returns what the model is told
 * @param {(name: string, args: object) => { summary: string, detail?: string }} [options.describe] a write in words, for the person to approve
 * @param {string} options.system the app's system prompt
 * @param {object[]} [options.messages] the conversation as the last turn returned it
 * @param {string} [options.text] what the person just said
 * @param {{ callId: string, approved: boolean }} [options.approve] the answer to the write that was waiting
 * @param {number} [options.maxSteps] model calls in one turn, at most
 * @param {number} [options.maxText] the most a person's message may be
 * @returns {Promise<{ messages: object[], reply: string | null, pending: { callId: string, tool: string, args: object, summary: string, detail?: string } | null, model: string | null, cost: number }>}
 */
export async function runTurn({ converse, tools, run, describe, system, messages = [], text, approve, maxSteps = 10, maxText = 8000 }) {
  const conversation = [{ role: "system", content: system }, ...messages.filter((m) => m && m.role !== "system")];
  const isWrite = (name) => tools.some((tool) => tool.name === name && tool.write === true);
  let cost = 0;
  let model = null;
  const answered = () => new Set(conversation.filter((m) => m.role === "tool").map((m) => m.tool_call_id));
  const result = (callId, value) => conversation.push({ role: "tool", tool_call_id: callId, content: JSON.stringify(value ?? null).slice(0, 60_000) });

  if (text?.trim()) conversation.push({ role: "user", content: text.trim().slice(0, maxText) });

  // The tool calls of the last assistant message that have no answer yet, in order.
  const settle = async () => {
    const last = [...conversation].reverse().find((m) => m.role === "assistant" && m.tool_calls?.length);
    if (!last) return null;
    for (const call of last.tool_calls) {
      if (answered().has(call.id)) continue;
      const name = call.function?.name;
      const args = parseArgs(call.function?.arguments);
      if (isWrite(name)) {
        const decision = approve?.callId === call.id ? approve : null;
        if (!decision) return { callId: call.id, tool: name, args, ...(describe ? describe(name, args) : { summary: `Run ${name}` }) };
        if (!decision.approved) {
          result(call.id, { declined: true, note: "The person declined this. Do not retry it." });
          continue;
        }
      }
      try {
        result(call.id, await run(name, args));
      } catch (error) {
        result(call.id, { error: error instanceof Error ? error.message : "It failed" });
      }
    }
    return null;
  };

  const done = (reply, pending) => ({ messages: conversation.filter((m) => m.role !== "system"), reply, pending, model, cost });

  for (let step = 0; step < maxSteps; step++) {
    const pending = await settle();
    if (pending) return done(null, pending);
    const answer = await converse({ messages: conversation });
    cost += Number(answer.cost) || 0;
    model = answer.model ?? model;
    conversation.push(answer.message);
    if (!answer.message.tool_calls?.length) return done(answer.message.content ?? "", null);
  }
  const pending = await settle();
  if (pending) return done(null, pending);
  return done("I stopped here: that took more steps than one turn allows. Tell me to go on if you want.", null);
}
