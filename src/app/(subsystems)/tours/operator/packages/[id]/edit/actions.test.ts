import { requireAuthenticated } from "./actions";
import * as serverAuth from "@/lib/tours/server-auth";

// Mock the server-auth module
jest.mock("@/lib/tours/server-auth");

describe("requireAuthenticated", () => {
  let mockSessionClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock Supabase client
    mockSessionClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(),
    };
  });

  describe("when user is not authenticated", () => {
    it("should return 401 error if session.error is set", async () => {
      jest.spyOn(serverAuth, "getVerifiedSession").mockResolvedValueOnce({
        user: null,
        role: null,
        error: "Auth error",
      });

      const result = await requireAuthenticated(mockSessionClient);

      expect(result).toEqual({
        error: {
          status: 401,
          message: "Authentication required. Please log in.",
        },
      });
    });

    it("should return 401 error if session.user is null", async () => {
      jest.spyOn(serverAuth, "getVerifiedSession").mockResolvedValueOnce({
        user: null,
        role: null,
        error: null,
      });

      const result = await requireAuthenticated(mockSessionClient);

      expect(result).toEqual({
        error: {
          status: 401,
          message: "Authentication required. Please log in.",
        },
      });
    });
  });

  describe("when user is authenticated but lacks operator role", () => {
    it("should return 403 error if user role is not 'operator'", async () => {
      jest.spyOn(serverAuth, "getVerifiedSession").mockResolvedValueOnce({
        user: { id: "user-123", email: "user@example.com" } as any,
        role: "tourist",
        error: null,
      });

      const result = await requireAuthenticated(mockSessionClient);

      expect(result).toEqual({
        error: {
          status: 403,
          message: "Access denied: operator role required",
        },
      });
    });

    it("should return 403 error if user role is null", async () => {
      jest.spyOn(serverAuth, "getVerifiedSession").mockResolvedValueOnce({
        user: { id: "user-123", email: "user@example.com" } as any,
        role: null,
        error: null,
      });

      const result = await requireAuthenticated(mockSessionClient);

      expect(result).toEqual({
        error: {
          status: 403,
          message: "Access denied: operator role required",
        },
      });
    });

    it("should return 403 error if user role is 'admin'", async () => {
      jest.spyOn(serverAuth, "getVerifiedSession").mockResolvedValueOnce({
        user: { id: "user-123", email: "user@example.com" } as any,
        role: "admin",
        error: null,
      });

      const result = await requireAuthenticated(mockSessionClient);

      expect(result).toEqual({
        error: {
          status: 403,
          message: "Access denied: operator role required",
        },
      });
    });
  });

  describe("when user is operator but operator profile not found", () => {
    it("should return 403 error if operator profile does not exist in database", async () => {
      jest.spyOn(serverAuth, "getVerifiedSession").mockResolvedValueOnce({
        user: { id: "user-123", email: "user@example.com" } as any,
        role: "operator",
        error: null,
      });

      mockSessionClient.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const result = await requireAuthenticated(mockSessionClient);

      expect(result).toEqual({
        error: {
          status: 403,
          message: "Access denied: operator role required",
        },
      });
    });

    it("should return 403 error if database query fails", async () => {
      jest.spyOn(serverAuth, "getVerifiedSession").mockResolvedValueOnce({
        user: { id: "user-123", email: "user@example.com" } as any,
        role: "operator",
        error: null,
      });

      mockSessionClient.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: new Error("Database error"),
      });

      const result = await requireAuthenticated(mockSessionClient);

      expect(result).toEqual({
        error: {
          status: 403,
          message: "Access denied: operator role required",
        },
      });
    });
  });

  describe("when operator exists but is not approved", () => {
    it("should return 403 error if operator accreditation_status is 'pending'", async () => {
      jest.spyOn(serverAuth, "getVerifiedSession").mockResolvedValueOnce({
        user: { id: "user-123", email: "user@example.com" } as any,
        role: "operator",
        error: null,
      });

      mockSessionClient.maybeSingle.mockResolvedValueOnce({
        data: {
          id: "operator-123",
          accreditation_status: "pending",
        },
        error: null,
      });

      const result = await requireAuthenticated(mockSessionClient);

      expect(result).toEqual({
        error: {
          status: 403,
          message:
            "Access denied: your operator account must be approved to edit packages",
        },
      });
    });

    it("should return 403 error if operator accreditation_status is 'rejected'", async () => {
      jest.spyOn(serverAuth, "getVerifiedSession").mockResolvedValueOnce({
        user: { id: "user-123", email: "user@example.com" } as any,
        role: "operator",
        error: null,
      });

      mockSessionClient.maybeSingle.mockResolvedValueOnce({
        data: {
          id: "operator-123",
          accreditation_status: "rejected",
        },
        error: null,
      });

      const result = await requireAuthenticated(mockSessionClient);

      expect(result).toEqual({
        error: {
          status: 403,
          message:
            "Access denied: your operator account must be approved to edit packages",
        },
      });
    });
  });

  describe("when user is authenticated, has operator role, and is approved", () => {
    it("should return success with operatorId and userId", async () => {
      const userId = "user-123";
      const operatorId = "operator-456";

      jest.spyOn(serverAuth, "getVerifiedSession").mockResolvedValueOnce({
        user: { id: userId, email: "user@example.com" } as any,
        role: "operator",
        error: null,
      });

      mockSessionClient.maybeSingle.mockResolvedValueOnce({
        data: {
          id: operatorId,
          accreditation_status: "approved",
        },
        error: null,
      });

      const result = await requireAuthenticated(mockSessionClient);

      expect(result).toEqual({
        data: {
          operatorId,
          userId,
        },
      });
    });

    it("should query the OPERATOR_TABLE with correct parameters", async () => {
      const userId = "user-123";

      jest.spyOn(serverAuth, "getVerifiedSession").mockResolvedValueOnce({
        user: { id: userId, email: "user@example.com" } as any,
        role: "operator",
        error: null,
      });

      mockSessionClient.maybeSingle.mockResolvedValueOnce({
        data: {
          id: "operator-456",
          accreditation_status: "approved",
        },
        error: null,
      });

      await requireAuthenticated(mockSessionClient);

      expect(mockSessionClient.from).toHaveBeenCalledWith("tours_operators");
      expect(mockSessionClient.select).toHaveBeenCalledWith(
        "id,accreditation_status"
      );
      expect(mockSessionClient.eq).toHaveBeenCalledWith("profile_id", userId);
    });
  });

  describe("error handling", () => {
    it("should return 401 error if getVerifiedSession throws exception", async () => {
      jest
        .spyOn(serverAuth, "getVerifiedSession")
        .mockRejectedValueOnce(new Error("Session error"));

      const result = await requireAuthenticated(mockSessionClient);

      expect(result).toEqual({
        error: {
          status: 401,
          message: "Authentication required. Please log in.",
        },
      });
    });

    it("should return 401 error if operator query throws exception", async () => {
      jest.spyOn(serverAuth, "getVerifiedSession").mockResolvedValueOnce({
        user: { id: "user-123", email: "user@example.com" } as any,
        role: "operator",
        error: null,
      });

      mockSessionClient.maybeSingle.mockRejectedValueOnce(
        new Error("Database error")
      );

      const result = await requireAuthenticated(mockSessionClient);

      expect(result).toEqual({
        error: {
          status: 401,
          message: "Authentication required. Please log in.",
        },
      });
    });
  });

  describe("property: Access Control by Role and Ownership", () => {
    it("validates that non-authenticated users always get 401", async () => {
      const testCases = [
        {
          user: null,
          role: null,
          error: "Not signed in",
        },
        {
          user: null,
          role: null,
          error: null,
        },
      ];

      for (const testCase of testCases) {
        jest.spyOn(serverAuth, "getVerifiedSession").mockResolvedValueOnce({
          user: testCase.user,
          role: testCase.role,
          error: testCase.error,
        });

        const result = await requireAuthenticated(mockSessionClient);

        expect(result).toHaveProperty("error");
        expect(result).toHaveProperty("error.status", 401);
      }
    });

    it("validates that non-operator authenticated users always get 403", async () => {
      const roles = ["admin", "tourist", "null", ""];

      for (const role of roles) {
        jest.spyOn(serverAuth, "getVerifiedSession").mockResolvedValueOnce({
          user: { id: "user-123", email: "user@example.com" } as any,
          role: role || null,
          error: null,
        });

        const result = await requireAuthenticated(mockSessionClient);

        expect(result).toHaveProperty("error");
        expect(result).toHaveProperty("error.status", 403);
        expect(result).toHaveProperty(
          "error.message",
          "Access denied: operator role required"
        );
      }
    });

    it("validates that unapproved operators always get 403", async () => {
      const statuses = ["pending", "rejected"];

      for (const status of statuses) {
        jest.spyOn(serverAuth, "getVerifiedSession").mockResolvedValueOnce({
          user: { id: "user-123", email: "user@example.com" } as any,
          role: "operator",
          error: null,
        });

        mockSessionClient.maybeSingle.mockResolvedValueOnce({
          data: {
            id: "operator-123",
            accreditation_status: status,
          },
          error: null,
        });

        const result = await requireAuthenticated(mockSessionClient);

        expect(result).toHaveProperty("error");
        expect(result).toHaveProperty("error.status", 403);
      }
    });

    it("validates that approved operators always succeed", async () => {
      jest.spyOn(serverAuth, "getVerifiedSession").mockResolvedValueOnce({
        user: { id: "user-123", email: "user@example.com" } as any,
        role: "operator",
        error: null,
      });

      mockSessionClient.maybeSingle.mockResolvedValueOnce({
        data: {
          id: "operator-123",
          accreditation_status: "approved",
        },
        error: null,
      });

      const result = await requireAuthenticated(mockSessionClient);

      expect(result).toHaveProperty("data");
      expect(result).toHaveProperty("data.operatorId", "operator-123");
      expect(result).toHaveProperty("data.userId", "user-123");
    });
  });
});
