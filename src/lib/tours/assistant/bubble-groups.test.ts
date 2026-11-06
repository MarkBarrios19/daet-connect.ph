import { bubbleRadius, bubbleShape } from "./bubble-groups";

describe("bubbleShape", () => {
  it("treats a lone message as both first and last", () => {
    expect(bubbleShape(["user"], 0)).toEqual({ first: true, last: true });
  });

  it("groups consecutive messages from the same side", () => {
    const roles = ["user", "assistant", "assistant", "assistant", "user"];
    expect(bubbleShape(roles, 1)).toEqual({ first: true, last: false });
    expect(bubbleShape(roles, 2)).toEqual({ first: false, last: false });
    expect(bubbleShape(roles, 3)).toEqual({ first: false, last: true });
    expect(bubbleShape(roles, 4)).toEqual({ first: true, last: true });
  });
});

describe("bubbleRadius", () => {
  it("keeps the tail corner flat and flattens the top join inside a group", () => {
    expect(bubbleRadius("assistant", { first: true, last: true })).toBe("rounded-[1.25rem] rounded-bl-md");
    expect(bubbleRadius("assistant", { first: false, last: true })).toContain("rounded-tl-md");
    expect(bubbleRadius("user", { first: false, last: false })).toContain("rounded-tr-md");
  });
});
