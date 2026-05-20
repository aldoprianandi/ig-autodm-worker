import type { Repository } from "../db/repository";
import type { DeliveryJob } from "../types";

type RecoveryRepository = Pick<Repository, "listRecoverableDeliveries">;

export async function recoverStaleDeliveries(
  repo: RecoveryRepository,
  queue: Queue<DeliveryJob>
): Promise<number> {
  const candidates = await repo.listRecoverableDeliveries();
  let queued = 0;

  for (const candidate of candidates) {
    await queue.send({
      deliveryId: candidate.deliveryId,
      campaignId: candidate.campaignId,
      igUserId: candidate.igUserId,
      deliveryType: candidate.deliveryType,
      commentId: candidate.commentId,
      stepIndex: candidate.stepIndex
    });
    queued += 1;
  }

  return queued;
}
