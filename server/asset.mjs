/** Return partial video bytes for mobile playback and seeks. */
export function assetResponse(request, type, bytes, restricted = false) {
  const headers = {
    "content-type": type,
    "x-content-type-options": "nosniff",
    "cache-control": "no-cache",
  };
  if (type === "text/html") headers["cache-control"] = "no-store";
  if (type === "image/webp" || type === "video/mp4")
    headers["cache-control"] = "public, max-age=3600";
  if (restricted) headers["cache-control"] = "private, no-store";
  let status = 200;
  if (type === "video/mp4") {
    headers["accept-ranges"] = "bytes";
    const length = bytes.length,
      range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      const start = match?.[1]
        ? Number(match[1])
        : Math.max(0, length - Number(match?.[2]));
      const end =
        match?.[1] && match[2]
          ? Math.min(Number(match[2]), length - 1)
          : length - 1;
      if (
        !match ||
        (!match[1] && !match[2]) ||
        !Number.isSafeInteger(start) ||
        start > end ||
        start >= length
      )
        return new Response(null, {
          status: 416,
          headers: { ...headers, "content-range": "bytes */" + length },
        });
      bytes = bytes.subarray(start, end + 1);
      headers["content-range"] = "bytes " + start + "-" + end + "/" + length;
      status = 206;
    }
  }
  headers["content-length"] = String(bytes.length);
  return new Response(request.method === "HEAD" ? null : bytes, {
    status,
    headers,
  });
}
