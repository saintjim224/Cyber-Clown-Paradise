"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, type Joker } from "@/lib/api";
import { saveActiveJoker } from "@/lib/clownAssets";

export default function ParkJoinPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function enterPark() {
      if (!params.token) {
        setError("入园码缺失，请重新扫描二维码。");
        return;
      }

      try {
        const joker = await apiFetch<Joker>(`/api/jokers/enter/${encodeURIComponent(params.token)}`, {
          method: "POST"
        });
        if (cancelled) return;
        saveActiveJoker(joker);
        router.replace("/park");
      } catch {
        if (!cancelled) setError("这个入园码暂时无法使用，请回到工坊重新生成小丑。");
      }
    }

    void enterPark();

    return () => {
      cancelled = true;
    };
  }, [params.token, router]);

  return (
    <main className="replay-shell">
      <section className="replay-panel">
        <span className="pixel-kicker">PRIVATE ENTRY</span>
        <h1>{error ? "入园码不可用" : "正在进入小丑乐园"}</h1>
        <p className="helper">{error ?? "正在恢复你的专属小丑身份，马上进入乐园投放气球。"}</p>
        {error ? (
          <a className="secondary-button" href="/workshop">
            回到灵魂工坊
          </a>
        ) : null}
      </section>
    </main>
  );
}
