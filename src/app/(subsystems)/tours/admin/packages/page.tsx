import { getAuthUser } from "@/lib/tours/server-auth";
import { formatPeso } from "@/lib/money";
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { PageFrame } from '@/components/ui/page-frame';

export default async function AdminPackagesPage() {
  const supabase = await createSupabaseServerClient();
  
  // Check if user is admin
  const user = await getAuthUser();
  if (!user) redirect('/');
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  
  if (profile?.role !== 'admin') {
    redirect('/');
  }

  // Get all packages with operator info
  const { data: packages, error } = await supabase
    .from('tours_packages')
    .select(`
      id,
      title,
      status,
      created_at,
      operator_id
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching packages:', error);
  }

  console.log('Packages fetched:', packages?.length || 0);

  // Get operator details separately to avoid relationship ambiguity
  let packagesWithOperators = packages || [];
  if (packages && packages.length > 0) {
    const operatorIds = [...new Set(packages.map(p => p.operator_id))];
    const packageIds = packages.map(p => p.id);
    
    const { data: operators } = await supabase
      .from('tours_operators')
      .select('id, business_name, contact_person, contact_email, profile_id')
      .in('id', operatorIds);

    const operatorMap = new Map(operators?.map(op => [op.id, op]) || []);

    // Get profile details for contact info
    const profileIds = operators?.map(op => op.profile_id).filter(Boolean) || [];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', profileIds);

    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

    // Get base price from price variants
    const { data: priceVariants } = await supabase
      .from('tours_package_price_variants')
      .select('package_id, price_per_pax, flat_price, is_default')
      .in('package_id', packageIds);

    // Create a map of package_id to base price (prefer default variant or first variant)
    const priceMap = new Map();
    priceVariants?.forEach(variant => {
      if (!priceMap.has(variant.package_id) || variant.is_default) {
        priceMap.set(variant.package_id, variant.price_per_pax || variant.flat_price || 0);
      }
    });

    packagesWithOperators = packages.map(pkg => {
      const operator = operatorMap.get(pkg.operator_id);
      const profile = operator ? profileMap.get(operator.profile_id) : null;
      const basePrice = priceMap.get(pkg.id) || 0;
      
      return {
        ...pkg,
        base_price: basePrice,
        tours_operators: operator ? {
          business_name: operator.business_name,
          // profiles has no email column; the operator's contact email is the business contact.
          profiles: {
            full_name: profile?.full_name ?? null,
            email: operator.contact_email,
          },
        } : null,
      };
    });
  }

  const pendingPackages = packagesWithOperators?.filter(p => p.status === 'pending_review' || p.status === 'pending') || [];
  const publishedPackages = packagesWithOperators?.filter(p => p.status === 'published') || [];
  const archivedPackages = packagesWithOperators?.filter(p => p.status === 'archived') || [];
  const draftPackages = packagesWithOperators?.filter(p => p.status === 'draft') || [];

  return (
    <PageFrame adminNav>
    <div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back Button */}
        <div className="mb-4">
          <Link
            href="/tours/admin"
            className="inline-flex min-h-11 items-center text-sm font-medium text-daet-ink/80 hover:text-daet-ink"
          >
            <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Admin Dashboard
          </Link>
        </div>

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="display-2 text-daet-ink">Package Management</h1>
            <p className="mt-2 text-daet-ink/80">Review and manage tour packages</p>
          </div>
        </div>

        {/* Pending Packages */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-daet-ink">
              Pending Approval ({pendingPackages.length})
            </h2>
          </div>
          
          {pendingPackages.length === 0 ? (
            <div className="card-edge bg-surface rounded-2xl p-6 text-center text-daet-ink/70">
              No pending packages
            </div>
          ) : (
            <div className="space-y-4">
              {pendingPackages.map((pkg) => (
                <PackageCard key={pkg.id} package={pkg} />
              ))}
            </div>
          )}
        </section>

        {/* Published Packages */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-daet-ink">
              Published ({publishedPackages.length})
            </h2>
          </div>
          
          {publishedPackages.length === 0 ? (
            <div className="card-edge bg-surface rounded-2xl p-6 text-center text-daet-ink/70">
              No published packages
            </div>
          ) : (
            <div className="space-y-4">
              {publishedPackages.map((pkg) => (
                <PackageCard key={pkg.id} package={pkg} />
              ))}
            </div>
          )}
        </section>

        {/* Archived Packages */}
        {archivedPackages.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-daet-ink">
                Archived ({archivedPackages.length})
              </h2>
            </div>
            
            <div className="space-y-4">
              {archivedPackages.map((pkg) => (
                <PackageCard key={pkg.id} package={pkg} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
    </PageFrame>
  );
}

function PackageCard({ package: pkg }: { package: any }) {
  const statusColors = {
    pending: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200',
    published: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300',
    archived: 'bg-muted text-daet-ink',
  };

  const operator = pkg.tours_operators;
  const operatorName = operator?.business_name || 'Unknown';
  const contactName = operator?.profiles?.full_name || 'Unknown';

  return (
    <div className="bg-surface rounded-2xl border border-daet-ink/20 p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-bold text-daet-ink">{pkg.title}</h3>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[pkg.status as keyof typeof statusColors]}`}>
              {pkg.status}
            </span>
          </div>
          
          <div className="space-y-1 text-sm text-daet-ink/80">
            <p><span className="font-medium">Operator:</span> {operatorName}</p>
            <p><span className="font-medium">Contact:</span> {contactName}</p>
            <p><span className="font-medium">Base Price:</span> {pkg.base_price == null ? 'N/A' : formatPeso(pkg.base_price)}</p>
            <p><span className="font-medium">Submitted:</span> {new Date(pkg.created_at).toLocaleDateString()}</p>
          </div>
        </div>

        <div className="ml-4">
          <Link
            href={`/tours/admin/packages/${pkg.id}`}
            className="min-h-11 inline-flex items-center px-4 py-2 border border-daet-ink/20 rounded-2xl text-sm font-medium text-daet-ink/80 bg-surface hover:bg-canvas"
          >
            Review
          </Link>
        </div>
      </div>
    </div>
  );
}
