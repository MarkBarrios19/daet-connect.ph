import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { PageFrame } from "@/components/ui/page-frame";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { MerchForm } from "../../../admin/merch/merch-form";
import { saveMyMerch } from "../actions";

export const metadata = { title: "Submit a product" };

export default async function NewOperatorMerchPage() {
  const session = await getAuthenticatedSession();
  if (!session.user) redirect(`/login?next=${encodeURIComponent("/tours/operator/merch/new")}`);
  if (session.role !== "operator") redirect("/tours/operator/merch");
  return (
    <PageFrame>
      <div className="mx-auto max-w-2xl">
        <h1 className="display-2 mb-4 text-daet-ink">Submit a product</h1>
        <Card>
          <MerchForm mode="operator" action={saveMyMerch} />
        </Card>
      </div>
    </PageFrame>
  );
}
