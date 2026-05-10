const imageUrlPrefix = import.meta.env.IMAGE_URL_PREFIX || "";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function trimLeadingSlash(value: string): string {
  return value.replace(/^\/+/, "");
}

function isExternalUrl(value: string): boolean {
  return /^(https?:|data:|blob:|\/\/)/i.test(value);
}

export function getImageUrl(src: string): string {
  if (!imageUrlPrefix || isExternalUrl(src) || !src.startsWith("/images/")) {
    return src;
  }

  return `${trimTrailingSlash(imageUrlPrefix)}/${trimLeadingSlash(src)}`;
}

export function cssImageUrl(src: string): string {
  return `url("${getImageUrl(src)}")`;
}
