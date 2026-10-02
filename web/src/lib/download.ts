import { api } from "@/lib/api";

export async function downloadTeamDataset(): Promise<string> {
  const { download_url, filename } = await api.getDownload();
  const anchor = document.createElement("a");
  anchor.href = download_url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return filename;
}
