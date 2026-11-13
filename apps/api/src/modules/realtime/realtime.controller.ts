import { Controller, Header, MessageEvent, Query, Sse } from '@nestjs/common';
import { filter, interval, map, merge, Observable, of } from 'rxjs';
import { RealtimeService } from './realtime.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { resolveBranchScope } from '../../common/branch/branch-scope.util';
import type { AuthenticatedUser } from '@medicore/shared-types';

const HEARTBEAT_MS = 25_000;

@Controller('realtime')
export class RealtimeController {
  constructor(private readonly realtime: RealtimeService) {}

  /**
   * Server-sent events for the caller's tenant (and branch, for branch-scoped users).
   * Events only say which topics changed; the client refetches via the normal APIs, so
   * permissions and branch scoping are enforced there, not here.
   */
  @Sse('stream')
  @Header('X-Accel-Buffering', 'no')
  stream(@CurrentUser() user: AuthenticatedUser, @Query('branchId') branchId?: string): Observable<MessageEvent> {
    const scope = resolveBranchScope(user, branchId);

    const changes = this.realtime.changes$.pipe(
      filter(
        (e) =>
          e.tenantId === user.tenantId && (scope === null || e.branchId === null || e.branchId === scope),
      ),
      map((e): MessageEvent => ({ type: 'change', data: { topics: e.topics } })),
    );
    // Keeps proxies and browsers from closing an idle connection.
    const heartbeat = interval(HEARTBEAT_MS).pipe(map((): MessageEvent => ({ type: 'ping', data: {} })));

    return merge(of<MessageEvent>({ type: 'ready', data: {} }), changes, heartbeat);
  }
}
