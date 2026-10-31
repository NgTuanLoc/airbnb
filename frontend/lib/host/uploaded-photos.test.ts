import { describe, expect, test } from "vitest";
import { PHOTO_OPTIONS } from "./options";
import { PHOTOS_FAILED, PHOTOS_PROCESSING, uploadedPhotoId, uploadedPhotoUrl } from "./uploaded-photos";

const ID_A = "0192f3a4b5c6d7e8f9a0b1c2d3e4f5a6";

describe("uploaded photo urls", () => {
  test("round-trip an id and refuse anything else", () => {
    expect(uploadedPhotoUrl(ID_A)).toBe(`/api/photos/${ID_A}`);
    expect(uploadedPhotoId(`/api/photos/${ID_A}`)).toBe(ID_A);
    expect(uploadedPhotoId("/api/photos/../x")).toBeNull();
    expect(uploadedPhotoId(`/api/photos/${ID_A.toUpperCase()}`)).toBeNull();
    expect(uploadedPhotoId(PHOTO_OPTIONS[0])).toBeNull();
  });

  test("the copy is fixed", () => {
    expect(PHOTOS_PROCESSING).toBe("Wait for photos to finish processing");
    expect(PHOTOS_FAILED).toBe("Remove photos that failed to upload");
  });
});
