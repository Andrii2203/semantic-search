# ADR-013: Local inference runs on the discrete GPU, not on the NPU

Status: accepted
Owner: repository owner
Last change: 2026-08-15 11:43:15 +0200
Supersedes: none

## 1. Problem

Embedding is the slowest thing this project does and every measurement waits on it.

Recorded in `docs/eval/beir-axes-a-b.md` section 4 and `docs/eval/local-news-axis-a.md` section 4, all
on CPU inside one container: 388.6 seconds for 5183 SciFact documents, 301.2 for 3633 NFCorpus,
426.0 for 2509 local articles, and 4871.9 seconds, which is 81 minutes, for 57638 FiQA documents.
That last number is why FiQA arrived after the sections that were supposed to include it were already
written.

The development machine was never asked what it could do. Read from it on 2026-08-15 at 11:12 +0200
with `Get-CimInstance`:

| Component | What is there | Peak INT8 |
|---|---|---|
| CPU | Intel Core Ultra 7 255H, 16 cores | not stated by Intel |
| NPU | Intel AI Boost | 13 TOPS |
| Integrated GPU | Intel Arc 140T | 74 TOPS |
| Discrete GPU | NVIDIA GeForce RTX 5060 Laptop | not read |
| Memory | 33.7 GB | |

The TOPS figures come from Intel's own product page for the 255H, read at 2026-08-15 11:20 +0200 and
reported there as NPU 13, GPU 74, platform total up to 96.

So the machine that produced 81 minutes of CPU embedding has a discrete NVIDIA GPU and an NPU that
neither the code nor any document in this repository has ever mentioned.

## 2. Decision

Local embedding and reindexing runs on the discrete GPU through the CUDA execution provider, selected
by `device: 'cuda'` in `@huggingface/transformers`, with `dml` as the fallback that also covers the
integrated Arc GPU. The NPU is not used.

Production keeps running on CPU. The device is a property of where a job runs, never of what the job
computes, so a vector produced on the GPU and the same vector produced on CPU must be interchangeable.

## 3. Proof of need

Not required. This is a defect fix in the sense of `docs/standards/DECISION_PROTOCOL.md` section 2:
81 minutes of avoidable wait per collection is a measured cost, and the fix adds no dependency,
because `onnxruntime-node` is already installed and already carries the execution providers.

## 4. Why not the NPU, which is the question that prompted this

Three reasons, in order of how much they decide it.

It is not reachable from this stack. `@huggingface/transformers` accepts the device strings `auto`,
`gpu`, `cpu`, `wasm`, `webgpu`, `cuda`, `dml`, `coreml`, `webnn`, `webnn-npu`, `webnn-gpu` and
`webnn-cpu`, read verbatim from the package's own type declaration at
https://unpkg.com/@huggingface/transformers@4.2.0/types/utils/devices.d.ts on 2026-08-15 11:26 +0200.
The only NPU entry there is `webnn-npu`, and WebNN is a browser API. In Node the NPU is reached
through Intel's own runtime, `openvino-node`, published at version 2026.3.0 and described by its
publisher as inference on Intel CPU, GPU and NPU, read on 2026-08-15 11:24 +0200. That is a second
inference runtime next to the one this project already has, for one machine.

It is the slowest of the three accelerators present. 13 TOPS on the NPU against 74 on the integrated
GPU, on Intel's own numbers, and the discrete RTX 5060 is a further step above that. The NPU exists
for sustained inference at low power, which is a laptop battery property and not a property anyone
needs while reindexing a corpus once.

It would only pay off in a product this project is not building. An NPU matters when inference runs
continuously on the end user's own device. Here the expensive inference is a batch job that runs on
one machine, and the per query cost is a single embedding of a short text, which is milliseconds on
any of the four devices.

## 5. What this changes and what it must not change

It changes how long a run takes and nothing else. Two rules keep that true.

A configuration report in `docs/eval/` names the device it ran on, next to the model identifier, per
`docs/standards/EVALUATION_STANDARD.md` section 4. A number produced on a GPU and compared against a
number produced on CPU is still a comparison of two configurations, and if the device turns out to
change results, that is a finding to record rather than a detail to hide.

The production path is unchanged and stays CPU only. `docs/plans/dependency-upgrade.md` moves the
container to Node 24, and nothing in this ADR asks a deployment target to have a GPU. The asymmetry
is deliberate and it is the shape of the work: indexing is a batch of thousands of embeddings and
happens where the developer is, a query is one embedding and happens in production.

## 6. Trade-offs

What this costs: a second code path that only one machine exercises, which is exactly the class of
thing `docs/standards/DECISION_PROTOCOL.md` question 5 calls carrying cost. It is one argument passed
to a pipeline, defaulting to CPU, so the cost is a line and an environment variable rather than a
module.

What it buys: 81 minutes becomes minutes on the largest collection this project has embedded, which
is the difference between running the axis matrix once and running it whenever a question comes up.

The risk that is worth naming: numerical differences between execution providers are real, usually in
the last decimals, and cosine similarity is a sum over 384 or 768 of them. If a comparison ever turns
on a fourth decimal, the device is a suspect, which is why section 5 requires it to be recorded.

## 7. Behaviours

1. The embedding path takes its device from configuration and defaults to cpu.
2. A run with an unavailable device fails with the device named, rather than silently falling back.
3. The device is recorded in the output of any script that writes a report to `docs/eval/`.
4. Vectors produced on cpu and on cuda for the same input agree within a stated tolerance.

## 8. Definition of done

- Every behaviour in section 7 has a passing test, except behaviour 4, which is a measurement recorded
  once in `docs/eval/` because it needs both devices.
- One collection is re-embedded on the GPU and the wall clock is recorded next to the CPU number
  already in `docs/eval/beir-axes-a-b.md` section 4.
- `npm run verify` is green on a machine with no GPU, proving the default path is untouched.

## 9. Rollback

| If | Action | Time |
|---|---|---|
| The CUDA provider fails to load | `dml` covers both GPUs on this machine, and `cpu` is the default | minutes |
| Vectors differ enough to change a ranking | The device goes back to cpu for anything that produces a number in `docs/eval/` and the difference becomes its own report | 1 hour |
| A second machine has no NVIDIA GPU | The default is cpu, so nothing there changes | not applicable |

## 10. Open questions

| Question | Trigger that forces an answer |
|---|---|
| How much faster the GPU actually is here, in documents per second against the 13 per second measured on CPU | The first GPU run |
| Whether the NPU becomes relevant | The product ships as something that runs continuously on an end user's own machine, which `docs/product/VISION.md` does not describe today |
| Whether quantisation to q8 on CPU beats fp32 on GPU for production, since production has no GPU | A production reindex takes longer than a cycle interval |
