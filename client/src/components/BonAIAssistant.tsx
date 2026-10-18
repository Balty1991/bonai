import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Send, Sparkles, X } from "lucide-react";
import { isoToday, newId, type AppData } from "@/lib/finance-data";
import { t } from "@/lib/i18n";
import { currentBonutPlan } from "@/lib/bonut-plan-current";
import { ASSISTANT_CAP, assistantUsage, parseQuery, recordAssistantUse, ROLES, runQuery, type AssistantAnswer, type RoleId, type Screen } from "@/lib/bonai-assistant";

type Msg = { id: string; role: "user" | "bot"; text: string; actions?: AssistantAnswer["actions"] };

/** Asistent BonAI: roluri, întrebări pe bonuri, cifre calculate din datele casei. */
export function BonAIAssistant({ data, onChange, onGo, onClose }: { data: AppData; onChange: (next: AppData) => void; onGo: (screen: Screen) => void; onClose: () => void }) {
  const [role, setRole] = useState<RoleId>("detective");
  const [text, setText] = useState("");
  const [used, setUsed] = useState(() => assistantUsage());
  const [msgs, setMsgs] = useState<Msg[]>(() => [{ id: "hi", role: "bot", text: t("Salut! Sunt asistentul BonAI. Alege un rol sau întreabă-mă direct despre bonurile, prețurile și cumpărăturile tale.") }]);
  const listRef = useRef<HTMLDivElement>(null);
  const plan = currentBonutPlan(data, isoToday());
  const cap = ASSISTANT_CAP[plan];
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [msgs]);
  const current = ROLES.find((item) => item.id === role)!;
  const ask = (raw: string) => {
    const question = raw.trim();
    if (!question) return;
    setText("");
    if (used >= cap) { setMsgs((m) => [...m, { id: newId("m"), role: "user", text: question }, { id: newId("m"), role: "bot", text: t("Ai folosit cele {cap} întrebări din luna asta. Cu BonAI Pro ai mai multe.", { cap }) }]); return; }
    setUsed(recordAssistantUse());
    const answer = runQuery(parseQuery(question, role), data);
    if (answer.listAdd?.length) {
      const have = new Set((data.settings.shoppingList || []).filter((item) => !item.done && !item.cleared).map((item) => item.text.toLocaleLowerCase("ro-RO")));
      const fresh = answer.listAdd.filter((item) => !have.has(item.toLocaleLowerCase("ro-RO")));
      const now = new Date().toISOString();
      if (fresh.length) onChange({ ...data, settings: { ...data.settings, shoppingList: [...(data.settings.shoppingList || []), ...fresh.map((item) => ({ id: newId("shop"), text: item, updatedAt: now }))] } });
    }
    setMsgs((m) => [...m, { id: newId("m"), role: "user", text: question }, { id: newId("m"), role: "bot", text: answer.text, actions: answer.actions }]);
  };
  const quick: Array<[Screen, string]> = [["scan", t("Scanează")], ["list", t("Listă")], ["prices", t("Prețuri")], ["pantry", t("Stoc")], ["menu", t("Meniu")]];
  return createPortal(<div className="bn-assist" role="dialog" aria-modal="true" aria-label={t("Asistent BonAI")}>
    <header className="bn-assist-head"><span className="bn-assist-mark" aria-hidden="true"><Sparkles size={18} /></span><span><b>{t("Asistent BonAI")}</b><small>{t("{used}/{cap} întrebări luna asta", { used, cap })}</small></span><button type="button" className="bn-icon-btn" aria-label={t("Închide")} onClick={onClose}><X size={20} /></button></header>
    <div className="bn-assist-roles" role="radiogroup" aria-label={t("Rolul asistentului")}>{ROLES.map((item) => <button key={item.id} type="button" role="radio" aria-checked={role === item.id} className={role === item.id ? "is-on" : undefined} onClick={() => setRole(item.id)}>{t(item.title)}</button>)}</div>
    <div className="bn-assist-log" ref={listRef}>
      {msgs.map((m) => <div key={m.id} className={`bn-assist-msg is-${m.role}`}><p>{m.text}</p>{m.actions?.length ? <div className="bn-assist-actions">{m.actions.map((a) => <button key={a.screen + a.label} type="button" onClick={() => onGo(a.screen)}>{t(a.label)}</button>)}</div> : null}</div>)}
      <div className="bn-assist-examples">{current.examples.map((ex) => <button key={ex} type="button" onClick={() => ask(ex)}>{t(ex)}</button>)}</div>
    </div>
    <div className="bn-assist-quick">{quick.map(([screen, label]) => <button key={screen} type="button" onClick={() => onGo(screen)}>{label}</button>)}</div>
    <form className="bn-assist-input" onSubmit={(event) => { event.preventDefault(); ask(text); }}><input value={text} onChange={(event) => setText(event.target.value)} placeholder={t("ex. cât am cheltuit pe lactate luna asta?")} aria-label={t("Întreabă asistentul")} enterKeyHint="send" /><button type="submit" className="bn-btn is-primary" aria-label={t("Trimite")} disabled={!text.trim()}><Send size={18} /></button></form>
  </div>, document.body);
}

export default BonAIAssistant;
