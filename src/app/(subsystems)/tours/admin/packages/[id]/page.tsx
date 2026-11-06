import { formatPeso } from "@/lib/money";
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { PageFrame } from '@/components/ui/page-frame';
import { PackageReviewForm } from './package-review-form';

export default async function AdminPackageReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  
  // Check if user is admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  
  if (profile?.role !== 'admin') {
    redirect('/');
  }

  // Get package details
  const { data: packageData, error } = await supabase
    .from('tours_packages')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !packageData) {
    console.error('Package fetch error:', error);
    return (
      <PageFrame adminNav>
        <div className="max-w-4xl mx-auto">
          <Link href="/tours/admin/packages" className="text-sm font-bold text-daet-ink/70 hover:text-daet-ink">
            ← All packages
          </Link>
          <div className="mt-4 bg-red-50 dark:bg-red-950/40 rounded-2xl p-6 text-center">
            <h1 className="text-lg font-bold text-red-800 dark:text-red-300">Package not found</h1>
            <p className="text-red-700 dark:text-red-300 text-sm mt-2">It may have been deleted. Go back to the package list and try again.</p>
          </div>
        </div>
      </PageFrame>
    );
  }

  // Get operator details separately
  const { data: operatorData } = await supabase
    .from('tours_operators')
    .select('id, business_name, contact_person, contact_phone, contact_email, profile_id')
    .eq('id', packageData.operator_id)
    .single();

  // Get operator profile
  let operatorProfile = null;
  if (operatorData?.profile_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', operatorData.profile_id)
      .single();
    operatorProfile = profile;
  }

  // Construct the data structure expected by the rest of the component
  const packageWithOperator = {
    ...packageData,
    tours_operators: operatorData ? {
      ...operatorData,
      profiles: operatorProfile,
    } : null,
  };

  // Get price variants
  const { data: priceVariants } = await supabase
    .from('tours_package_price_variants')
    .select('*')
    .eq('package_id', id)
    .order('min_pax', { ascending: true });

  // Get inclusions
  const { data: inclusions } = await supabase
    .from('tours_package_inclusions')
    .select('*')
    .eq('package_id', id)
    .order('display_order', { ascending: true });

  // Get itinerary stops
  const { data: stops } = await supabase
    .from('tours_package_stops')
    .select('*')
    .eq('package_id', id)
    .order('stop_order', { ascending: true });

  // Get gallery images
  const { data: gallery } = await supabase
    .from('tours_package_gallery')
    .select('*')
    .eq('package_id', id)
    .order('display_order', { ascending: true });

  const operator = packageWithOperator.tours_operators;

  return (
    <PageFrame adminNav>
    <div>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back Button */}
        <div className="mb-4">
          <Link
            href="/tours/admin/packages"
            className="inline-flex items-center text-sm font-medium text-daet-ink/80 hover:text-daet-ink"
          >
            <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Package Management
          </Link>
        </div>

        {/* Header */}
        <div className="mb-8">
          <h1 className="display-2 text-daet-ink">{packageWithOperator.title}</h1>
          <p className="mt-2 text-daet-ink/80">Review package details and approve or reject</p>
        </div>

        {/* Package Details */}
        <div className="bg-surface rounded-2xl border border-daet-ink/20 p-6 mb-6">
          <h2 className="text-xl font-bold text-daet-ink mb-4">Package Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="block text-sm font-bold text-daet-ink/80 mb-1">Status</p>
              <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${
                packageWithOperator.status === 'pending_review' ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200' :
                packageWithOperator.status === 'published' ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300' :
                packageWithOperator.status === 'rejected' ? 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300' :
                'bg-muted text-daet-ink'
              }`}>
                {packageWithOperator.status}
              </span>
            </div>

            <div className="md:col-span-2">
              <p className="block text-sm font-bold text-daet-ink/80 mb-1">Description</p>
              <p className="text-daet-ink whitespace-pre-wrap">{packageWithOperator.description}</p>
            </div>
          </div>
        </div>

        {/* Operator Information */}
        <div className="bg-surface rounded-2xl border border-daet-ink/20 p-6 mb-6">
          <h2 className="text-xl font-bold text-daet-ink mb-4">Operator Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="block text-sm font-bold text-daet-ink/80 mb-1">Business Name</p>
              <p className="text-daet-ink">{operator?.business_name || 'N/A'}</p>
            </div>

            <div>
              <p className="block text-sm font-bold text-daet-ink/80 mb-1">Contact Person</p>
              <p className="text-daet-ink">{operator?.contact_person || 'N/A'}</p>
            </div>

            <div>
              <p className="block text-sm font-bold text-daet-ink/80 mb-1">Contact Number</p>
              <p className="text-daet-ink">{operator?.contact_phone || 'N/A'}</p>
            </div>

            <div>
              <p className="block text-sm font-bold text-daet-ink/80 mb-1">Email</p>
              <p className="text-daet-ink">{operator?.contact_email || 'N/A'}</p>
            </div>
          </div>
        </div>

        {/* Price Variants */}
        {priceVariants && priceVariants.length > 0 && (
          <div className="bg-surface rounded-2xl border border-daet-ink/20 p-6 mb-6">
            <h2 className="text-xl font-bold text-daet-ink mb-4">Pricing</h2>
            
            <div className="space-y-3">
              {priceVariants.map((variant, index) => (
                <div key={index} className="flex justify-between items-center p-3 bg-canvas rounded-2xl">
                  <span className="text-daet-ink/80">
                    {variant.min_pax} - {variant.max_pax} pax
                  </span>
                  <span className="font-bold text-daet-ink">
                    {formatPeso(variant.price_per_pax)} per person
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Inclusions */}
        {inclusions && inclusions.length > 0 && (
          <div className="bg-surface rounded-2xl border border-daet-ink/20 p-6 mb-6">
            <h2 className="text-xl font-bold text-daet-ink mb-4">Inclusions</h2>
            
            <ul className="space-y-2">
              {inclusions.map((item, index) => (
                <li key={index} className="flex items-start">
                  <span className={item.is_included ? "text-green-500 mr-2" : "text-red-500 mr-2"}>
                    {item.is_included ? "✓" : "✗"}
                  </span>
                  <span className="text-daet-ink/80">{item.item_text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Itinerary */}
        {stops && stops.length > 0 && (
          <div className="bg-surface rounded-2xl border border-daet-ink/20 p-6 mb-6">
            <h2 className="text-xl font-bold text-daet-ink mb-4">Itinerary</h2>
            
            <div className="space-y-4">
              {stops.map((stop, index) => (
                <div key={index} className="flex">
                  <div className="flex flex-col items-center mr-4">
                    <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
                      {stop.stop_order}
                    </div>
                    {index < stops.length - 1 && (
                      <div className="w-0.5 h-full bg-line mt-2" />
                    )}
                  </div>
                  
                  <div className="flex-1 pb-6">
                    <h3 className="font-bold text-daet-ink mb-1">{stop.location_name}</h3>
                    <p className="text-daet-ink/80 text-sm">{stop.description}</p>
                    {stop.estimated_duration_minutes && (
                      <p className="text-daet-ink/70 text-sm mt-1">Duration: {stop.estimated_duration_minutes} min</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Gallery */}
        {gallery && gallery.length > 0 && (
          <div className="bg-surface rounded-2xl border border-daet-ink/20 p-6 mb-6">
            <h2 className="text-xl font-bold text-daet-ink mb-4">Gallery ({gallery.length} images)</h2>
            <p className="text-daet-ink/80 text-sm">Image URLs stored in database</p>
          </div>
        )}

        {/* Review Form */}
        <PackageReviewForm packageId={id} currentStatus={packageWithOperator.status} />
      </div>
    </div>
    </PageFrame>
  );
}
