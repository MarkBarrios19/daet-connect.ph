/**
 * Messenger-style grouping: consecutive messages from the same side form a
 * group. Inside a group the corner next to the neighbouring bubble is flat, and
 * only the last bubble of an assistant group carries the avatar.
 */
export type BubbleShape = { first: boolean; last: boolean };

export function bubbleShape(roles: readonly string[], index: number): BubbleShape {
  const role = roles[index];
  return {
    first: index === 0 || roles[index - 1] !== role,
    last: index === roles.length - 1 || roles[index + 1] !== role,
  };
}

/** Tailwind radius classes for a bubble on the given side: flat corners join a group's bubbles. */
export function bubbleRadius(side: "user" | "assistant", shape: BubbleShape): string {
  // The bottom near corner is always flat: it is the tail on the last bubble and
  // the join on the others. The top near corner is flat unless the bubble opens the group.
  if (side === "user") return `rounded-[1.25rem] rounded-br-md ${shape.first ? "" : "rounded-tr-md"}`.trim();
  return `rounded-[1.25rem] rounded-bl-md ${shape.first ? "" : "rounded-tl-md"}`.trim();
}
