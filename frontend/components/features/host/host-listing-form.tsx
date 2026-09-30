"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button, TextInput } from "@/components/design-system";
import { createHostListing, updateHostListing } from "@/lib/api-client/host";
import { AMENITY_OPTIONS, HOST_CATEGORIES, HOST_CITIES, MAX_PHOTOS, PHOTO_OPTIONS, PROPERTY_TYPES } from "@/lib/host/options";
import { hostListingInputSchema, type HostListingInput } from "@/lib/host/schemas";
import { cn } from "@/lib/utils";

type Field = keyof HostListingInput;
type Errors = Partial<Record<Field, string>>;

const STEPS: { title: string; fields: Field[] }[] = [
  { title: "Tell us about your place", fields: ["title", "propertyType", "category", "description"] },
  { title: "Where is it, and how big?", fields: ["cityId", "maxGuests", "bedrooms", "beds", "baths"] },
  { title: "Amenities and photos", fields: ["amenities", "photos"] },
  { title: "Set your price and review", fields: ["pricePerNight"] },
];

const EMPTY: HostListingInput = {
  title: "", description: "", propertyType: "", category: "", cityId: "",
  maxGuests: 2, bedrooms: 1, beds: 1, baths: 1, amenities: [], photos: [], pricePerNight: 100,
};

const fieldClass = "h-14 rounded-sm border border-hairline bg-canvas px-3 text-body-md text-ink focus:border-2 focus:border-ink focus:outline-none";

export type HostListingFormProps = { mode: "create" } | { mode: "edit"; listingId: string; initial: HostListingInput };

export function HostListingForm(props: HostListingFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<HostListingInput>(props.mode === "edit" ? props.initial : EMPTY);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isLast = step === STEPS.length - 1;

  function set<K extends Field>(field: K, value: HostListingInput[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  /** Errors for the given fields only, from the one shared schema. */
  function errorsFor(fields: Field[]): Errors {
    const parsed = hostListingInputSchema.safeParse(values);
    if (parsed.success) return {};
    const found: Errors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as Field;
      if (fields.includes(field) && !found[field]) found[field] = issue.message;
    }
    return found;
  }

  function goNext() {
    const stepErrors = errorsFor(STEPS[step].fields);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length === 0) setStep((s) => s + 1);
  }

  function invalidateListingQueries() {
    queryClient.invalidateQueries({ queryKey: ["listings"] });
    queryClient.invalidateQueries({ queryKey: ["search-listings"] });
  }

  async function submit() {
    const parsed = hostListingInputSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(errorsFor(STEPS.flatMap((s) => s.fields)));
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      if (props.mode === "create") {
        const listing = await createHostListing(parsed.data);
        invalidateListingQueries();
        router.push(`/host/listings?created=${encodeURIComponent(listing.id)}`);
      } else {
        await updateHostListing(props.listingId, parsed.data);
        invalidateListingQueries();
        router.push("/host/listings");
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  function togglePhoto(url: string) {
    if (values.photos.includes(url)) set("photos", values.photos.filter((p) => p !== url));
    else if (values.photos.length < MAX_PHOTOS) set("photos", [...values.photos, url]);
  }

  function toggleAmenity(amenity: string) {
    set("amenities", values.amenities.includes(amenity) ? values.amenities.filter((a) => a !== amenity) : [...values.amenities, amenity]);
  }

  const numberField = (field: "maxGuests" | "bedrooms" | "beds" | "baths", label: string, min: number, max: number, stepBy = 1) => (
    <TextInput
      label={label}
      type="number"
      min={min}
      max={max}
      step={stepBy}
      value={String(values[field])}
      onChange={(e) => set(field, Number(e.target.value))}
      error={errors[field]}
    />
  );

  const select = (field: "propertyType" | "category" | "cityId", label: string, options: { value: string; label: string }[]) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={field} className="text-caption text-muted">{label}</label>
      <select id={field} value={values[field]} onChange={(e) => set(field, e.target.value)} className={fieldClass} aria-invalid={errors[field] ? true : undefined}>
        <option value="">Select…</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {errors[field] && <span className="text-body-sm text-error">{errors[field]}</span>}
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
      <p className="text-body-sm text-muted">Step {step + 1} of {STEPS.length}</p>
      <h1 className="text-display-md text-ink">{STEPS[step].title}</h1>

      {step === 0 && (
        <div className="flex flex-col gap-4">
          <TextInput label="Title" value={values.title} onChange={(e) => set("title", e.target.value)} error={errors.title} />
          {select("propertyType", "Property type", PROPERTY_TYPES.map((t) => ({ value: t, label: t })))}
          {select("category", "Category", HOST_CATEGORIES.map((c) => ({ value: c, label: c })))}
          <div className="flex flex-col gap-1">
            <label htmlFor="description" className="text-caption text-muted">Description</label>
            <textarea id="description" rows={5} value={values.description} onChange={(e) => set("description", e.target.value)}
              className="rounded-sm border border-hairline bg-canvas p-3 text-body-md text-ink focus:border-2 focus:border-ink focus:outline-none"
              aria-invalid={errors.description ? true : undefined} />
            {errors.description && <span className="text-body-sm text-error">{errors.description}</span>}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{select("cityId", "City", HOST_CITIES.map((c) => ({ value: c.id, label: `${c.name}, ${c.country}` })))}</div>
          {numberField("maxGuests", "Guests", 1, 16)}
          {numberField("bedrooms", "Bedrooms", 0, 20)}
          {numberField("beds", "Beds", 1, 30)}
          {numberField("baths", "Baths", 0.5, 20, 0.5)}
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-6">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-title-sm text-ink">Amenities</legend>
            <div className="grid grid-cols-2 gap-2">
              {AMENITY_OPTIONS.map((amenity) => (
                <label key={amenity} className="flex items-center gap-2 text-body-md text-ink">
                  <input type="checkbox" checked={values.amenities.includes(amenity)} onChange={() => toggleAmenity(amenity)} />
                  {amenity}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-title-sm text-ink">Photos (pick up to {MAX_PHOTOS}; the first is the cover)</legend>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {PHOTO_OPTIONS.map((url, index) => {
                const position = values.photos.indexOf(url);
                return (
                  <button key={url} type="button" aria-label={`Photo ${index + 1}`} aria-pressed={position >= 0} onClick={() => togglePhoto(url)}
                    className={cn("relative aspect-square overflow-hidden rounded-sm border-2", position >= 0 ? "border-ink" : "border-transparent")}>
                    <Image src={url} alt="" fill sizes="160px" className="object-cover" />
                    {position >= 0 && (
                      <span className="absolute left-1 top-1 flex size-6 items-center justify-center rounded-full bg-ink text-caption text-on-primary">{position + 1}</span>
                    )}
                  </button>
                );
              })}
            </div>
            {errors.photos && <span className="text-body-sm text-error">{errors.photos}</span>}
          </fieldset>
        </div>
      )}

      {isLast && (
        <div className="flex flex-col gap-6">
          <TextInput label="Price per night" type="number" min={10} max={10000} value={String(values.pricePerNight)}
            onChange={(e) => set("pricePerNight", Number(e.target.value))} error={errors.pricePerNight} />
          <dl className="flex flex-col gap-2 rounded-md border border-hairline p-4 text-body-sm text-body">
            <div className="flex justify-between"><dt>Title</dt><dd>{values.title}</dd></div>
            <div className="flex justify-between"><dt>Type</dt><dd>{values.propertyType} · {values.category}</dd></div>
            <div className="flex justify-between"><dt>City</dt><dd>{HOST_CITIES.find((c) => c.id === values.cityId)?.name}</dd></div>
            <div className="flex justify-between"><dt>Size</dt><dd>{values.maxGuests} guests · {values.bedrooms} bedrooms · {values.beds} beds · {values.baths} baths</dd></div>
            <div className="flex justify-between"><dt>Photos</dt><dd>{values.photos.length}</dd></div>
          </dl>
        </div>
      )}

      {formError && <p role="alert" className="text-body-sm text-error">{formError}</p>}

      <div className="flex justify-between border-t border-hairline pt-4">
        <Button type="button" variant="tertiary" onClick={() => setStep((s) => s - 1)} disabled={step === 0 || submitting}>Back</Button>
        {isLast ? (
          <Button type="button" onClick={submit} disabled={submitting}>{props.mode === "create" ? "Publish" : "Save"}</Button>
        ) : (
          <Button type="button" onClick={goNext}>Next</Button>
        )}
      </div>
    </div>
  );
}
