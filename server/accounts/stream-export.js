function writeChunk(res, value) {
  if (res.destroyed) return Promise.reject(Error("Export connection closed."));
  if (res.write(value)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const clear = () => {
      res.off("drain", ready);
      res.off("close", closed);
      res.off("error", closed);
    };
    const ready = () => {
        clear();
        resolve();
      },
      closed = () => {
        clear();
        reject(Error("Export connection closed."));
      };
    res.once("drain", ready);
    res.once("close", closed);
    res.once("error", closed);
  });
}
export async function streamAccountExport(res, value) {
  await writeChunk(res, "{");
  const entries = Object.entries(value);
  for (let index = 0; index < entries.length; index++) {
    const [key, item] = entries[index];
    await writeChunk(res, (index ? "," : "") + JSON.stringify(key) + ":");
    if (Array.isArray(item)) {
      await writeChunk(res, "[");
      for (let at = 0; at < item.length; at++)
        await writeChunk(res, (at ? "," : "") + JSON.stringify(item[at]));
      await writeChunk(res, "]");
    } else await writeChunk(res, JSON.stringify(item));
  }
  res.end("}");
}
