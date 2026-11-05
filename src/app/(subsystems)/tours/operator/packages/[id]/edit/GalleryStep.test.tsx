/** @jest-environment jsdom */

import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { GalleryStep } from "./GalleryStep";
import { deletePackageImage, uploadPackageImage } from "./actions";
import type { EditGalleryImage, EditPackageStatus } from "./edit-types";

const confirmMock = jest.fn();

jest.mock("@/components/ui/feedback", () => ({
  useFeedback: () => ({ toast: jest.fn(), confirm: confirmMock }),
}));

jest.mock("./actions", () => ({
  uploadPackageImage: jest.fn(),
  deletePackageImage: jest.fn(),
}));

const mockedUpload = uploadPackageImage as jest.MockedFunction<typeof uploadPackageImage>;
const mockedDelete = deletePackageImage as jest.MockedFunction<typeof deletePackageImage>;

const photo = (name: string, type = "image/jpeg") => new File(["x"], name, { type });

const dropEvent = (files: File[]) => {
  const event = new Event("drop", { bubbles: true, cancelable: true }) as Event & {
    dataTransfer: unknown;
  };
  event.dataTransfer = { types: ["Files"], files, dropEffect: "" };
  return event;
};

const image = (id: string, order: number): EditGalleryImage => ({
  id,
  imageUrl: `https://example.supabase.co/storage/v1/object/public/tours-package-media/${id}.jpg`,
  caption: null,
  displayOrder: order,
});

const three = [image("a", 1), image("b", 2), image("c", 3)];

/**
 * The real form feeds onUpdate back in as new props. Mirror that here when a
 * test needs to see the effect of its own change (the published warning does).
 */
function StatefulGallery({ initial, packageStatus }: { initial: EditGalleryImage[]; packageStatus: EditPackageStatus }) {
  const [data, setData] = React.useState(initial);
  return (
    <GalleryStep
      packageId="pkg-1"
      data={data}
      originalData={initial}
      packageStatus={packageStatus}
      onUpdate={setData}
      errors={{}}
      loading={false}
    />
  );
}

function renderGallery({
  data = three,
  originalData = three,
  packageStatus = "draft" as EditPackageStatus,
}: {
  data?: EditGalleryImage[];
  originalData?: EditGalleryImage[];
  packageStatus?: EditPackageStatus;
} = {}) {
  const onUpdate = jest.fn();

  const { container } = render(
    <GalleryStep
      packageId="pkg-1"
      data={data}
      originalData={originalData}
      packageStatus={packageStatus}
      onUpdate={onUpdate}
      errors={{}}
      loading={false}
    />,
  );

  return { onUpdate, section: container.firstElementChild as Element };
}

beforeEach(() => {
  let objectUrl = 0;
  Object.defineProperty(URL, "createObjectURL", {
    writable: true,
    value: jest.fn(() => `blob:mock-${(objectUrl += 1)}`),
  });
  Object.defineProperty(URL, "revokeObjectURL", { writable: true, value: jest.fn() });

  confirmMock.mockResolvedValue(true);
  let uploaded = 0;
  mockedUpload.mockImplementation(async () => {
    uploaded += 1;
    return {
      success: true,
      imageUrl: `https://example.supabase.co/storage/v1/object/public/tours-package-media/new-${uploaded}.jpg`,
    };
  });
  mockedDelete.mockResolvedValue({ success: true } as never);
});

describe("GalleryStep", () => {
  it("renders a card per photo, numbered, with the first photo flagged", () => {
    renderGallery();

    expect(screen.getByLabelText("Photo 1 of 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Photo 3 of 3")).toBeInTheDocument();
    expect(screen.getByText("First photo")).toBeInTheDocument();
    expect(screen.getByText("3 of 20 photos")).toBeInTheDocument();
  });

  it("shows the add tile and the help line", () => {
    renderGallery();

    expect(screen.getByText("Add photos or drop them here")).toBeInTheDocument();
    expect(screen.getByText(/maximum 20 photos/)).toBeInTheDocument();
  });

  it("hides the add tile and the button once 20 photos are in place", () => {
    const twenty = Array.from({ length: 20 }, (_, i) => image(`p${i}`, i + 1));
    renderGallery({ data: twenty, originalData: twenty });

    expect(screen.queryByText("Add photos or drop them here")).not.toBeInTheDocument();
    expect(screen.queryByText("Add photos")).not.toBeInTheDocument();
    expect(screen.getByText("20 of 20 photos")).toBeInTheDocument();
  });

  describe("ordering", () => {
    it("moves a photo to the front from its menu and renumbers 1..n", async () => {
      const { onUpdate } = renderGallery();

      fireEvent.click(screen.getByLabelText("Photo 3 options"));
      fireEvent.click(screen.getByRole("menuitem", { name: "Make first photo" }));

      await waitFor(() => expect(onUpdate).toHaveBeenCalled());

      const next = onUpdate.mock.calls.at(-1)?.[0] as EditGalleryImage[];
      expect(next.map((entry) => entry.id)).toEqual(["c", "a", "b"]);
      expect(next.map((entry) => entry.displayOrder)).toEqual([1, 2, 3]);
    });

    it("steps a photo earlier from its menu", async () => {
      const { onUpdate } = renderGallery();

      fireEvent.click(screen.getByLabelText("Photo 3 options"));
      fireEvent.click(screen.getByRole("menuitem", { name: "Move earlier" }));

      await waitFor(() => expect(onUpdate).toHaveBeenCalled());

      const next = onUpdate.mock.calls.at(-1)?.[0] as EditGalleryImage[];
      expect(next.map((entry) => entry.id)).toEqual(["a", "c", "b"]);
    });

    it("offers no reorder controls when the status forbids them", () => {
      renderGallery({ packageStatus: "pending_review" });

      expect(screen.queryByLabelText("Move photo 1")).not.toBeInTheDocument();
      fireEvent.click(screen.getByLabelText("Photo 1 options"));
      expect(screen.queryByRole("menuitem", { name: "Move earlier" })).not.toBeInTheDocument();
      expect(screen.queryByText("First photo")).toBeInTheDocument();
    });

    // Keyboard reordering is dnd-kit's KeyboardSensor, which needs real
    // element geometry to pick a neighbour; jsdom reports 0x0 rects for every
    // card, so it can only be exercised in a browser (see the follow-up e2e).
    // The menu's Move earlier / Move later / Make first photo are the
    // keyboard-reachable equivalents and are covered above.
  });

  describe("captions", () => {
    it("saves a caption without touching the order", async () => {
      const { onUpdate } = renderGallery();

      fireEvent.click(screen.getAllByText("Add caption")[0]);
      const field = screen.getByLabelText("Caption for photo 1");
      fireEvent.change(field, { target: { value: "White sand at sunrise" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(onUpdate).toHaveBeenCalled());

      const next = onUpdate.mock.calls.at(-1)?.[0] as EditGalleryImage[];
      expect(next[0].caption).toBe("White sand at sunrise");
      expect(next.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
    });
  });

  describe("delete", () => {
    it("asks first, and keeps the photo when the answer is no", async () => {
      confirmMock.mockResolvedValue(false);
      const { onUpdate } = renderGallery();

      fireEvent.click(screen.getByLabelText("Photo 2 options"));
      fireEvent.click(screen.getByRole("menuitem", { name: "Delete photo" }));

      await waitFor(() => expect(confirmMock).toHaveBeenCalled());
      expect(onUpdate).not.toHaveBeenCalled();
      expect(mockedDelete).not.toHaveBeenCalled();
    });

    it("removes the photo from the list once confirmed", async () => {
      const { onUpdate } = renderGallery();

      fireEvent.click(screen.getByLabelText("Photo 2 options"));
      fireEvent.click(screen.getByRole("menuitem", { name: "Delete photo" }));

      await waitFor(() => expect(onUpdate).toHaveBeenCalled());

      const next = onUpdate.mock.calls.at(-1)?.[0] as EditGalleryImage[];
      expect(next.map((entry) => entry.id)).toEqual(["a", "c"]);
      expect(next.map((entry) => entry.displayOrder)).toEqual([1, 2]);
      expect(mockedDelete).toHaveBeenCalledWith("pkg-1", three[1].imageUrl);
    });
  });

  describe("uploads", () => {
    it("shows a placeholder tile per file, counts it, then becomes a card", async () => {
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = () => resolve();
      });
      mockedUpload.mockImplementation(async () => {
        await gate;
        return {
          success: true,
          imageUrl: "https://example.supabase.co/storage/v1/object/public/tours-package-media/slow.jpg",
        };
      });

      const { onUpdate, section } = renderGallery();

      fireEvent(section, dropEvent([photo("one.jpg"), photo("two.jpg")]));

      await waitFor(() => expect(screen.getAllByText("Uploading...")).toHaveLength(2));
      expect(screen.getByText("5 of 20 photos")).toBeInTheDocument();
      expect(screen.getByText("Uploading 1 of 2")).toBeInTheDocument();

      release();

      await waitFor(() => expect(screen.queryAllByText("Uploading...")).toHaveLength(0));
      await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(2));

      const last = onUpdate.mock.calls.at(-1)?.[0] as EditGalleryImage[];
      expect(last).toHaveLength(5);
      expect(last.map((entry) => entry.displayOrder)).toEqual([1, 2, 3, 4, 5]);
    });

    it("names a file it refuses and still uploads the good ones", async () => {
      const { section } = renderGallery();

      fireEvent(section, dropEvent([photo("good.jpg"), photo("notes.txt", "text/plain")]));

      await waitFor(() => expect(mockedUpload).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(section.textContent).toContain("notes.txt"));
    });

    it("shows the action's message on the tile and can try again", async () => {
      mockedUpload.mockResolvedValueOnce({
        success: false,
        error: { message: "Storage said no" },
      } as never);

      const { section } = renderGallery();

      fireEvent(section, dropEvent([photo("bad.jpg")]));

      await waitFor(() => expect(screen.getByText("Storage said no")).toBeInTheDocument());

      const tile = screen.getByText("Storage said no").closest("div")?.parentElement as HTMLElement;
      fireEvent.click(within(tile).getByRole("button", { name: "Try again" }));

      await waitFor(() => expect(mockedUpload).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByText("Storage said no")).not.toBeInTheDocument());
    });

    it("counts uploading tiles against the 20-photo limit", async () => {
      const nineteen = Array.from({ length: 19 }, (_, i) => image(`p${i}`, i + 1));
      let release: () => void = () => {};
      mockedUpload.mockImplementation(async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return { success: true, imageUrl: "https://example.supabase.co/x.jpg" };
      });

      const { section } = renderGallery({ data: nineteen, originalData: nineteen });

      fireEvent(section, dropEvent([photo("a.jpg"), photo("b.jpg")]));

      await waitFor(() => expect(screen.getByText("20 of 20 photos")).toBeInTheDocument());
      expect(screen.getByText(/Only 1 more photo can be added/)).toBeInTheDocument();

      release();
    });
  });

  describe("published packages", () => {
    it("warns before any change is made", () => {
      renderGallery({ packageStatus: "published" });

      expect(
        screen.getByText(/Adding, removing or reordering photos sends this package back/),
      ).toBeInTheDocument();
    });

    it("switches to an unsaved-changes warning after a reorder", async () => {
      render(<StatefulGallery initial={three} packageStatus="published" />);

      fireEvent.click(screen.getByLabelText("Photo 2 options"));
      fireEvent.click(screen.getByRole("menuitem", { name: "Move earlier" }));

      await waitFor(() =>
        expect(screen.getByText(/Unsaved changes: saving sends this package back/)).toBeInTheDocument(),
      );
    });
  });
});
