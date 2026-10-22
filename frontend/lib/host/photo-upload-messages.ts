// Fixed text for every way an upload can fail, keyed by the API's code or the function's rejection reason.
const MESSAGES: Record<string, string> = {
  photo_too_large: "Photos must be 10 MB or smaller",
  photo_unsupported_type: "Use a JPEG, PNG or WebP photo",
  not_an_image: "This file isn't a photo we can read",
  too_small: "Photos need to be at least 400 pixels on the short side",
  too_large_dimensions: "This photo is too large (over 40 megapixels)",
  timeout: "Still processing — try again later",
};

export function photoUploadMessage(code: string | undefined): string {
  return (code && MESSAGES[code]) || "Upload failed — try again";
}
