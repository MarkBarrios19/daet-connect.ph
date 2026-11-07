/** @jest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import {
  UnsavedChangesGuard,
  describeChangeCount,
  isInternalNavigation,
  useBeforeUnloadGuard,
} from "./unsaved-changes";

const push = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (href: string) => push(href), refresh: jest.fn() }),
}));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

beforeEach(() => push.mockReset());

/** A page with the guard and a few ways out, the way the editor's chrome has them. */
function Page({ when, changes = 2 }: { when: boolean; changes?: number }) {
  return (
    <div>
      <UnsavedChangesGuard when={when} changes={changes} />
      <a href="/tours/operator/packages">All packages</a>
      <a href="#prices">Jump to prices</a>
      <a href="https://example.com/help">Help elsewhere</a>
      <a href="/tours/operator/packages" target="_blank" rel="noreferrer">
        New tab
      </a>
      <a href="/tours/operator/packages" download>
        Download
      </a>
      {/* Exactly where we already are: nothing to lose, nothing to ask. */}
      <a href={`${window.location.pathname}${window.location.search}`}>Same page</a>
      <a href="/tours/messages" id="blank" target="_blank">
        Messages
      </a>
    </div>
  );
}

describe("describeChangeCount", () => {
  it("says one change or many, never 1 changes", () => {
    expect(describeChangeCount(1)).toBe("1 unsaved change");
    expect(describeChangeCount(0)).toBe("0 unsaved changes");
    expect(describeChangeCount(4)).toBe("4 unsaved changes");
  });
});

describe("isInternalNavigation", () => {
  const anchor = (html: string) => {
    const host = document.createElement("div");
    host.innerHTML = html;
    return host.firstElementChild as HTMLAnchorElement;
  };

  it("counts a link to another page in the app", () => {
    expect(isInternalNavigation(anchor('<a href="/tours/messages">x</a>'))).toBe(true);
  });

  it("leaves alone the ways out that keep the editor open", () => {
    expect(isInternalNavigation(anchor('<a href="#prices">x</a>'))).toBe(false);
    expect(isInternalNavigation(anchor('<a href="https://example.com">x</a>'))).toBe(false);
    expect(isInternalNavigation(anchor('<a href="/tours/messages" target="_blank">x</a>'))).toBe(false);
    expect(isInternalNavigation(anchor('<a href="/tours/messages" download>x</a>'))).toBe(false);
    // The same page with different query: still the editor.
    expect(
      isInternalNavigation(anchor(`<a href="${window.location.pathname}${window.location.search}">x</a>`)),
    ).toBe(false);
  });
});

describe("UnsavedChangesGuard", () => {
  it("asks before an in-app link takes the person away, naming how much is at stake", () => {
    render(<Page when />);
    fireEvent.click(screen.getByRole("link", { name: "All packages" }));

    const dialog = screen.getByRole("dialog", { name: "Leave without saving?" });
    expect(dialog).toHaveTextContent("You have 2 unsaved changes.");
    expect(push).not.toHaveBeenCalled();
  });

  it("leaves when the person says so", () => {
    render(<Page when />);
    fireEvent.click(screen.getByRole("link", { name: "All packages" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave page" }));

    expect(push).toHaveBeenCalledWith("/tours/operator/packages");
  });

  it("stays, with focus back on the link, when the person changes their mind", () => {
    render(<Page when />);
    const link = screen.getByRole("link", { name: "All packages" });
    link.focus();
    fireEvent.click(link);
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(push).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(link);
  });

  it("does not stand in the way of anchors, other sites, a new tab or a download", () => {
    render(<Page when />);

    for (const name of ["Jump to prices", "Help elsewhere", "New tab", "Download", "Same page"]) {
      fireEvent.click(screen.getByRole("link", { name }));
      expect(screen.queryByRole("dialog", { name: "Leave without saving?" })).not.toBeInTheDocument();
    }
    expect(push).not.toHaveBeenCalled();
  });

  it("lets every link through when there is nothing to lose", () => {
    render(<Page when={false} />);
    fireEvent.click(screen.getByRole("link", { name: "All packages" }));

    expect(screen.queryByRole("dialog", { name: "Leave without saving?" })).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("asks the browser before a reload or a closed tab, only while dirty", () => {
    const { unmount } = render(<Page when />);
    const dirty = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
    unmount();

    render(<Page when={false} />);
    const clean = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
  });

  it("stands down while the page is asking its own question", () => {
    const { rerender } = render(
      <div>
        <UnsavedChangesGuard when changes={1} holding />
        <a href="/tours/messages">Messages</a>
      </div>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Messages" }));

    // The page's own dialog is the one question on screen; the guard does not
    // stack a second one, and the link is held rather than followed.
    expect(screen.queryByRole("dialog", { name: "Leave without saving?" })).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();

    rerender(
      <div>
        <UnsavedChangesGuard when changes={1} holding={false} />
        <a href="/tours/messages">Messages</a>
      </div>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Messages" }));
    expect(screen.getByRole("dialog", { name: "Leave without saving?" })).toBeInTheDocument();
  });
});

describe("useBeforeUnloadGuard", () => {
  function Harness({ when }: { when: boolean }) {
    useBeforeUnloadGuard(when);
    return null;
  }

  it("registers one listener and takes it away again", () => {
    const add = jest.spyOn(window, "addEventListener");
    const remove = jest.spyOn(window, "removeEventListener");

    const { unmount } = render(<Harness when />);
    expect(add.mock.calls.filter(([type]) => type === "beforeunload")).toHaveLength(1);
    unmount();
    expect(remove.mock.calls.filter(([type]) => type === "beforeunload")).toHaveLength(1);

    add.mockRestore();
    remove.mockRestore();
  });
});
