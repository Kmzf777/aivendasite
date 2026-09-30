// Tarefa 1: so prova que o service worker alcanca o localhost.
//
// Por que isso precisa ser provado antes de qualquer outra coisa: o content
// script roda em https://meet.google.com, e chamar http://localhost de la e
// mixed content, que o Chrome bloqueia EM SILENCIO (o fetch pendura ate dar
// timeout). A aposta do design v2 e que o service worker, com host_permissions
// explicito, nao sofre essa regra. Se a aposta estiver errada, o plano B e
// chamar a api.typesafe.ai direto daqui.

async function diagnostico(origem) {
  const r = { origem, quando: new Date().toISOString() };
  const t0 = Date.now();
  try {
    const resp = await fetch("http://localhost:3000/jev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "jev-1.13.0",
        state: "Esse valor ta fora do meu orcamento.",
        questions: {
          tem_objecao: {
            type: "noul",
            instructions: "Is the customer objecting?",
            criteria: { true: "Yes", false: "No" }
          }
        }
      })
    });
    const j = await resp.json();
    r.ok = resp.ok;
    r.status = resp.status;
    r.noul = j && j.answers && j.answers.tem_objecao && j.answers.tem_objecao.noul;
    r.ms = Date.now() - t0;
  } catch (e) {
    r.ok = false;
    r.erro = e.name + ": " + e.message;
    r.ms = Date.now() - t0;
  }

  console.log("=".repeat(56));
  console.log("[COPILOTO] DIAGNOSTICO localhost:", JSON.stringify(r, null, 1));
  console.log(r.ok
    ? "[COPILOTO] ALCANCA O LOCALHOST. Pode seguir para a Tarefa 2."
    : "[COPILOTO] NAO ALCANCA. Ver plano B na Tarefa 1 Step 6 do plano.");
  console.log("=".repeat(56));

  await chrome.storage.local.set({ diagnostico: r });
  return r;
}

chrome.runtime.onInstalled.addListener(() => diagnostico("onInstalled"));
chrome.runtime.onStartup.addListener(() => diagnostico("onStartup"));

// Permite reexecutar sob demanda pelo DevTools do service worker:
//   await diagnostico("manual")
self.diagnostico = diagnostico;
