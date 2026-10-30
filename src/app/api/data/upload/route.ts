import { NextResponse } from "next/server";
import { getSession, isLocalMode } from "@/lib/auth";
import { ingestBuffer } from "@/lib/csv";
import { clientIp, countEvent, rateLimit, sweepIfNeeded } from "@/lib/trial";
import type { FileUploadResult } from "@/lib/api-types";

export const runtime = "nodejs";

const MAX_FILES = 10;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const UPLOAD_LIMIT_PER_HOUR = 10;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录。" }, { status: 401 });

  if (!isLocalMode()) {
    sweepIfNeeded();
    const rl = rateLimit(`upload:${clientIp(req)}`, UPLOAD_LIMIT_PER_HOUR, 3600_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: `上传过于频繁（IP 限速 ${UPLOAD_LIMIT_PER_HOUR} 次/小时），请 ${rl.retryAfterSec} 秒后重试。` },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
      );
    }
    countEvent(session.project.id, "session");
    countEvent(session.project.id, "upload");
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "请求不是合法的 multipart 表单。" }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "没有收到文件。" }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `一次最多上传 ${MAX_FILES} 个文件。` },
      { status: 400 }
    );
  }

  const results: FileUploadResult[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      results.push({
        filename: file.name,
        ok: false,
        error: `文件超过 ${MAX_FILE_BYTES / 1024 / 1024}MB 上限。`,
      });
      continue;
    }
    const buf = Buffer.from(await file.arrayBuffer());
    results.push(ingestBuffer(session.project.id, file.name, buf));
  }

  return NextResponse.json({ files: results });
}