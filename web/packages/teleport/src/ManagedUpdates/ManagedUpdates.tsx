/**
 * Teleport
 * Copyright (C) 2026  Gravitational, Inc.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import { format, formatDistanceToNowStrict } from 'date-fns';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import styled, { useTheme } from 'styled-components';

import {
  Alert,
  Box,
  Button,
  ButtonIcon,
  Flex,
  H2,
  Indicator,
  Link,
  Text,
} from 'design';
import Table, { Cell } from 'design/DataTable';
import { ArrowSquareOut, Clock, Info, Refresh, Warning } from 'design/Icon';
import { HoverTooltip } from 'design/Tooltip';
import { MenuButton, MenuItem } from 'shared/components/MenuAction';
import { useInfoGuide } from 'shared/components/SlidingSidePanel/InfoGuide';
import useAttempt from 'shared/hooks/useAttemptNext';
import { useInterval } from 'shared/hooks/useInterval';
import { capitalizeFirstLetter } from 'shared/utils/text';

import {
  FeatureBox,
  FeatureHeader,
  FeatureHeaderTitle,
} from 'teleport/components/Layout';
import cfg from 'teleport/config';
import api from 'teleport/services/api';
import {
  ClusterMaintenanceInfo,
  GroupActionResponse,
  GroupState,
  ManagedUpdatesDetails,
  RolloutGroupInfo,
  RolloutInfo,
  RolloutStrategy,
  ToolsAutoUpdateInfo,
} from 'teleport/services/managedUpdates';
import useTeleport from 'teleport/useTeleport';

const DOCS_URL = 'https://goteleport.com/docs/upgrading/agent-managed-updates/';
const TOOLS_DOCS_URL =
  'https://goteleport.com/docs/upgrading/client-tools-managed-updates/';
const SUPPORT_URL = 'https://support.goteleport.com';
const POLLING_INTERVAL_MS = 60_000; // 1 minute

export interface ClusterMaintenanceCardProps {
  data: ClusterMaintenanceInfo;
}

export interface ManagedUpdatesProps {
  /**
   * Cluster maintenance card component. This is used by Cloud.
   */
  ClusterMaintenanceCard?: React.ComponentType<ClusterMaintenanceCardProps>;
}

export function ManagedUpdates({
  ClusterMaintenanceCard,
}: ManagedUpdatesProps) {
  const ctx = useTeleport();
  const canUpdateRollout = ctx.storeUser.state.acl.autoUpdateAgentRollout.edit;

  const [data, setData] = useState<ManagedUpdatesDetails>(null);
  const [selectedGroupName, setSelectedGroupName] = useState<string>(null);
  const [lastSyncedTime, setLastSyncedTime] = useState<Date>(null);
  const [actionError, setActionError] = useState<string>(null);
  const { attempt, run } = useAttempt('processing');
  const { setInfoGuideConfig } = useInfoGuide();

  const selectedGroup =
    data?.groups?.find(g => g.name === selectedGroupName) || null;

  const fetchData = useCallback(() => {
    return api.get(cfg.getManagedUpdatesUrl()).then(response => {
      setData(response);
      setLastSyncedTime(new Date());
    });
  }, []);

  useEffect(() => {
    run(() => fetchData());
  }, [run, fetchData]);

  // Automatically re-sync every 1 minute
  useInterval(fetchData, POLLING_INTERVAL_MS);

  useEffect(() => {
    if (selectedGroup && data?.rollout) {
      setInfoGuideConfig({
        title: 'Progress Details',
        guide: (
          <GroupDetailsPanel
            group={selectedGroup}
            rollout={data.rollout}
            orphanedAgentVersionCounts={
              selectedGroup.isCatchAll
                ? data.orphanedAgentVersionCounts
                : undefined
            }
          />
        ),
        id: selectedGroup.name,
        panelWidth: 350,
        onClose: () => setSelectedGroupName(null),
      });
    } else {
      setInfoGuideConfig(null);
    }
  }, [
    selectedGroup,
    data?.rollout,
    data?.orphanedAgentVersionCounts,
    setInfoGuideConfig,
  ]);

  const handleGroupAction = async (
    action: 'start' | 'done' | 'rollback',
    groupName: string,
    force?: boolean
  ) => {
    setActionError(null);
    try {
      const url = cfg.getManagedUpdatesGroupActionUrl(groupName, action);
      const body = action === 'start' ? { force: force ?? false } : {};
      const response: GroupActionResponse = await api.post(url, body);

      // Update with the data that was returned
      if (response.group && data?.groups) {
        setData({
          ...data,
          groups: data.groups.map(g =>
            g.name === groupName ? response.group : g
          ),
        });
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to perform group action'
      );
    }
  };

  if (attempt.status === 'processing') {
    return (
      <FeatureBox px={9}>
        <FeatureHeader>
          <FeatureHeaderTitle>Managed Updates</FeatureHeaderTitle>
        </FeatureHeader>
        <Box textAlign="center" m={10}>
          <Indicator />
        </Box>
      </FeatureBox>
    );
  }

  if (attempt.status === 'failed') {
    return (
      <FeatureBox px={9}>
        <FeatureHeader>
          <FeatureHeaderTitle>Managed Updates</FeatureHeaderTitle>
        </FeatureHeader>
        <Alert kind="danger" details={attempt.statusText}>
          Failed to load managed updates details
        </Alert>
      </FeatureBox>
    );
  }

  const isConfigured = checkIsConfigured(data);

  return (
    <FeatureBox px={9}>
      <FeatureHeader>
        <FeatureHeaderTitle>Managed Updates</FeatureHeaderTitle>
      </FeatureHeader>

      {!isConfigured && cfg.isCloud && (
        <Alert
          kind="warning"
          mb={3}
          primaryAction={{
            content: 'Go to Teleport Customer Center',
            href: SUPPORT_URL,
          }}
        >
          Could not detect configuration
          <Text typography="body2" mt={1}>
            Open a Support ticket in the Teleport Customer Center to report this
            view and request assistance for next steps.
          </Text>
        </Alert>
      )}

      <Box>
        <Flex gap={3} mb={3}>
          <ClientToolsCard
            tools={data?.tools}
            fullWidth={!data?.clusterMaintenance}
          />
          {data?.clusterMaintenance && ClusterMaintenanceCard && (
            <ClusterMaintenanceCard data={data.clusterMaintenance} />
          )}
        </Flex>

        <RolloutCard
          rollout={data?.rollout}
          groups={data?.groups}
          orphanedAgentVersionCounts={data?.orphanedAgentVersionCounts}
          selectedGroupName={selectedGroupName}
          onGroupSelect={setSelectedGroupName}
          onGroupAction={handleGroupAction}
          onRefresh={fetchData}
          lastSyncedTime={lastSyncedTime}
          actionError={actionError}
          onDismissError={() => setActionError(null)}
          canUpdateRollout={canUpdateRollout}
        />
      </Box>
    </FeatureBox>
  );
}

/**
 * checkIsConfigured returns true if managed updates are configured.
 */
function checkIsConfigured(data: ManagedUpdatesDetails): boolean {
  if (!data) return false;

  const rolloutMode = data.rollout?.mode?.toLowerCase();
  if (rolloutMode && rolloutMode !== 'disabled' && rolloutMode !== '') {
    return true;
  }

  const toolsMode = data.tools?.mode?.toLowerCase();
  if (toolsMode && toolsMode !== 'disabled' && toolsMode !== '') {
    return true;
  }

  return false;
}

function NotConfiguredText({ docsUrl }: { docsUrl: string }) {
  if (cfg.isCloud) {
    return (
      <Text
        css={`
          font-style: italic;
        `}
      >
        Could not detect a configuration for this feature.
      </Text>
    );
  }

  return (
    <>
      <Text color="text.slightlyMuted" mb={3}>
        Follow the guide to set this up for your cluster.
      </Text>
      <Button as="a" href={docsUrl} target="_blank" px={3}>
        View configuration guide in Docs
        <ArrowSquareOut size="small" ml={2} />
      </Button>
    </>
  );
}

export const Card = styled(Box)`
  background-color: ${p => p.theme.colors.levels.surface};
  border-radius: ${p => p.theme.radii[3]}px;
  padding: ${p => p.theme.space[3]}px;
  border: 1px solid ${p => p.theme.colors.interactive.tonal.neutral[2]};
`;

export const CardTitle = styled(H2)`
  font-size: 18px;
  font-weight: 400;
  margin-bottom: ${p => p.theme.space[2]}px;
`;

export function InfoItem({
  label,
  value,
  valueLink,
  labelWidth = 140,
  mb = 1,
}: {
  label: string;
  value: ReactNode;
  valueLink?: string;
  labelWidth?: number;
  mb?: number;
}) {
  return (
    <Flex gap={2} mb={mb}>
      <Text
        color="text.muted"
        bold
        css={`
          min-width: ${labelWidth}px;
        `}
      >
        {label}:
      </Text>
      {valueLink ? (
        <Link
          href={valueLink}
          target="_blank"
          css={`
            display: inline-flex;
            align-items: center;
          `}
        >
          {value} <ArrowSquareOut size="small" ml={1} />
        </Link>
      ) : (
        <Text>{value}</Text>
      )}
    </Flex>
  );
}

function ClientToolsCard({
  tools,
  fullWidth,
}: {
  tools?: ToolsAutoUpdateInfo;
  fullWidth?: boolean;
}) {
  const toolsMode = tools?.mode?.toLowerCase();
  const isToolsConfigured =
    !!toolsMode && toolsMode !== 'disabled' && toolsMode !== '';

  return (
    <Card flex={fullWidth ? 1 : '1 1 50%'}>
      <CardTitle>Client Tools Automatic Updates</CardTitle>
      <Flex alignItems="flex-start" gap={1} mb={3} flexDirection="column">
        <Text color="text.slightlyMuted">
          Keep client tools like <strong>tsh</strong> and <strong>tctl</strong>{' '}
          up to date with automatic or managed updates.
        </Text>
        {isToolsConfigured && <DocsLink docsUrl={TOOLS_DOCS_URL} />}
      </Flex>
      <Box>
        {isToolsConfigured ? (
          <>
            <InfoItem
              label="Status"
              value={capitalizeFirstLetter(tools?.mode)}
            />
            <InfoItem
              label="Target version"
              value={tools?.targetVersion || '-'}
            />
          </>
        ) : (
          <NotConfiguredText docsUrl={TOOLS_DOCS_URL} />
        )}
      </Box>
    </Card>
  );
}

function RolloutCard({
  rollout,
  groups,
  orphanedAgentVersionCounts,
  selectedGroupName,
  onGroupSelect,
  onGroupAction,
  onRefresh,
  lastSyncedTime,
  actionError,
  onDismissError,
  canUpdateRollout,
}: {
  rollout?: RolloutInfo;
  groups?: RolloutGroupInfo[];
  orphanedAgentVersionCounts?: Record<string, number>;
  selectedGroupName: string;
  onGroupSelect: (name: string) => void;
  onGroupAction: (
    action: 'start' | 'done' | 'rollback',
    groupName: string,
    force?: boolean
  ) => Promise<void>;
  onRefresh: () => void;
  lastSyncedTime: Date;
  actionError: string;
  onDismissError: () => void;
  canUpdateRollout: boolean;
}) {
  const rolloutMode = rollout?.mode?.toLowerCase();
  const isRolloutConfigured =
    !!rolloutMode && rolloutMode !== 'disabled' && rolloutMode !== '';
  const groupCount = groups?.length || 0;
  const isImmediateSchedule = rollout?.schedule === 'immediate';
  const orphanedCount = getOrphanedCount(orphanedAgentVersionCounts);
  const hasOrphanedAgents = orphanedCount > 0;
  const lastGroup = groups?.[groups.length - 1];

  return (
    <Card>
      <CardTitle>Rollout Configuration for Agent Instances</CardTitle>
      <Flex alignItems="flex-start" gap={1} mb={3} flexDirection="column">
        <Text color="text.slightlyMuted">
          Editors can set and manage rollout configuration in the CLI.
        </Text>
        {isRolloutConfigured && <DocsLink docsUrl={DOCS_URL} />}
      </Flex>

      {actionError && (
        <Alert kind="danger" mb={3} dismissible onDismiss={onDismissError}>
          {actionError}
        </Alert>
      )}

      {!isRolloutConfigured ? (
        <NotConfiguredText docsUrl={DOCS_URL} />
      ) : (
        <>
          <Box mb={3}>
            <InfoItem
              label="Status"
              value={capitalizeFirstLetter(rollout?.mode)}
            />
            <InfoItem label="Start" value={rollout?.startVersion || '-'} />
            <InfoItem label="Target" value={rollout?.targetVersion || '-'} />
            <InfoItem
              label="Strategy"
              value={
                <Flex alignItems="center" gap={1}>
                  {capitalizeFirstLetter(rollout?.strategy)}
                  <HoverTooltip
                    tipContent={
                      rollout?.strategy === 'halt-on-error'
                        ? 'Groups are updated sequentially. If a group fails, the rollout halts until manually resolved.'
                        : 'Groups are updated based on their configured maintenance window schedules.'
                    }
                    placement="right"
                  >
                    <Info size="small" color="text.muted" />
                  </HoverTooltip>
                </Flex>
              }
            />
          </Box>

          {isImmediateSchedule ? (
            <Alert kind="info" mb={0}>
              The rollout schedule has been set to <strong>immediate</strong>.
              Every group immediately updates to the target version.
            </Alert>
          ) : (
            <>
              {hasOrphanedAgents && lastGroup && (
                <Alert kind="warning" mb={3} dismissible>
                  Agent instances not assigned to a rollout group have been
                  detected.
                  <Text typography="body2" mt={1}>
                    Ungrouped agent instances can be reviewed in the progress
                    details of the last group <strong>{lastGroup.name}</strong>.
                    Ungrouped instances are listed separately and do not affect
                    the last group&apos;s rollout progress.
                  </Text>
                </Alert>
              )}

              <Flex justifyContent="space-between" alignItems="center" mb={3}>
                <Text typography="body2">
                  {groupCount} rollout group{groupCount !== 1 ? 's' : ''}
                </Text>
                <Flex alignItems="center" gap={2}>
                  {lastSyncedTime && (
                    <Text color="text.muted" typography="body3">
                      Last synced: {lastSyncedTime.toLocaleTimeString()}
                    </Text>
                  )}
                  <HoverTooltip tipContent="Refresh data">
                    <ButtonIcon
                      size={0}
                      onClick={onRefresh}
                      color="text.muted"
                      css={`
                        border-radius: ${p => p.theme.radii[2]}px;
                        border: 1px solid
                          ${p => p.theme.colors.interactive.tonal.neutral[0]};
                      `}
                    >
                      <Refresh size="small" />
                    </ButtonIcon>
                  </HoverTooltip>
                </Flex>
              </Flex>

              <GroupsTable
                groups={groups || []}
                orphanedCount={orphanedCount}
                selectedGroupName={selectedGroupName}
                onGroupSelect={onGroupSelect}
                onGroupAction={onGroupAction}
                strategy={rollout?.strategy}
                canUpdateRollout={canUpdateRollout}
              />
            </>
          )}
        </>
      )}
    </Card>
  );
}

function GroupsTable({
  groups,
  orphanedCount,
  selectedGroupName,
  onGroupSelect,
  onGroupAction,
  strategy,
  canUpdateRollout,
}: {
  groups: RolloutGroupInfo[];
  orphanedCount: number;
  selectedGroupName: string;
  onGroupSelect: (name: string) => void;
  onGroupAction: (
    action: 'start' | 'done' | 'rollback',
    groupName: string,
    force?: boolean
  ) => Promise<void>;
  strategy?: RolloutStrategy;
  canUpdateRollout: boolean;
}) {
  const theme = useTheme();
  const [actionInProgress, setActionInProgress] = useState<string>(null);

  const handleAction = async (
    action: 'start' | 'done' | 'rollback',
    groupName: string,
    force?: boolean
  ) => {
    setActionInProgress(`${action}-${groupName}`);
    try {
      await onGroupAction(action, groupName, force);
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <TableContainer>
      <Table
        key={strategy}
        data={groups}
        columns={[
          // We only show the order column for halt-on-error strategy
          ...(strategy === 'halt-on-error'
            ? [
                {
                  key: 'position' as const,
                  headerText: 'Order',
                  isSortable: true,
                  render: (group: RolloutGroupInfo) => (
                    <Cell
                      css={`
                        text-align: center;
                        width: 60px;
                        padding-left: 0;
                        padding-right: 0;
                      `}
                    >
                      <Text typography="body2">{group.position || '-'}</Text>
                    </Cell>
                  ),
                },
              ]
            : []),
          {
            key: 'name',
            headerText: 'Rollout Group',
            isSortable: true,
            render: group => {
              const isLastWithOrphans = group.isCatchAll && orphanedCount > 0;
              return (
                <Cell>
                  <Text typography="body2" fontWeight={500}>
                    {group.name}
                  </Text>
                  <Text typography="body2" color="text.muted">
                    {group.presentCount} agent instances
                  </Text>
                  {isLastWithOrphans && (
                    <Text
                      typography="body2"
                      color="interactive.solid.alert.default"
                    >
                      + {orphanedCount} ungrouped instances
                    </Text>
                  )}
                </Cell>
              );
            },
          },
          {
            key: 'state',
            headerText: 'Status',
            isSortable: true,
            render: group => (
              <Cell
                css={`
                  white-space: nowrap;
                `}
              >
                <StatusBadge state={group.state} />
              </Cell>
            ),
          },
          {
            key: 'upToDateCount',
            headerText: 'Progress',
            isSortable: true,
            onSort: (a, b) => getProgress(a) - getProgress(b),
            render: group => {
              const percent = getProgress(group);
              // If progress is >90%, but >10% of the initial agents have dropped, we show a warning that this group will never
              // complete automatically. This is because in the backend, we only mark a group as done when the `initialCount` of agents
              // is updated. This can never happen if agents drop or are deleted while the rollout is in progress.
              const hasAgentsDropped =
                percent > 90 && group.presentCount / group.initialCount < 0.9;

              return (
                <Cell
                  css={`
                    min-width: 180px;
                  `}
                >
                  <Flex flexDirection="column" gap={1}>
                    <Text typography="body2">
                      {percent}% complete{' '}
                      <Text as="span" color="text.muted" typography="body2">
                        ({group.upToDateCount} of {group.presentCount})
                      </Text>
                    </Text>
                    <ProgressBar percent={percent} />
                    {hasAgentsDropped && (
                      <HoverTooltip
                        tipContent={
                          'This group will not automatically complete because more than 10% of the initial agents in this group are no longer connected. For the rollout to proceed, the agents must be reconnected or you can manually mark this group as done.'
                        }
                        placement="top"
                      >
                        <Flex alignItems="flex-start" gap={1}>
                          <Warning
                            size="small"
                            color="warning.main"
                            mr={1}
                            css={`
                              margin-top: 2px;
                            `}
                          />
                          <Text typography="body3" color="warning.main">
                            This group will not automatically complete.
                          </Text>
                        </Flex>
                      </HoverTooltip>
                    )}
                  </Flex>
                </Cell>
              );
            },
          },
          {
            key: 'stateReason',
            headerText: 'Status Detail',
            isSortable: true,
            render: group => {
              const reason = getReadableStateReason(group.stateReason);
              const statusDetail =
                group.state === 'canary'
                  ? `Canary (${group.canarySuccessCount}/${group.canaryCount}) - ${reason}`
                  : reason;

              return (
                <Cell>
                  {statusDetail && (
                    <>
                      <Text typography="body2">{statusDetail}</Text>
                      {group.lastUpdateTime && (
                        <Flex alignItems="center" gap={1}>
                          <Text typography="body2" color="text.muted">
                            {formatDistanceToNowStrict(
                              new Date(group.lastUpdateTime),
                              { addSuffix: true }
                            )}
                          </Text>
                          <HoverTooltip
                            tipContent={format(
                              new Date(group.lastUpdateTime),
                              "MMMM d, yyyy 'at' h:mm a"
                            )}
                          >
                            <Clock size="small" color="text.muted" />
                          </HoverTooltip>
                        </Flex>
                      )}
                    </>
                  )}
                </Cell>
              );
            },
          },
          {
            key: 'startTime',
            headerText: 'Start Time',
            isSortable: true,
            render: group => (
              <Cell>
                <Text typography="body2" color="text.muted">
                  {group.startTime
                    ? format(
                        new Date(group.startTime),
                        "MMMM d, yyyy '·' h:mm a"
                      )
                    : 'Not started'}
                </Text>
              </Cell>
            ),
          },
          {
            altKey: 'actions',
            render: group => {
              const isLoading = actionInProgress !== null;
              const isDisabled = !canUpdateRollout || isLoading;

              const button = (
                <MenuButton
                  buttonText="Actions"
                  buttonProps={{
                    disabled: isDisabled,
                    style: isLoading ? { cursor: 'wait' } : undefined,
                  }}
                >
                  <MenuItem
                    onClick={() => handleAction('start', group.name)}
                    disabled={
                      isLoading ||
                      group.state === 'active' ||
                      group.state === 'done'
                    }
                  >
                    Start Update
                  </MenuItem>
                  <MenuItem
                    onClick={() => handleAction('start', group.name, true)}
                    disabled={
                      isLoading ||
                      group.state === 'active' ||
                      group.state === 'done'
                    }
                  >
                    Force Update
                  </MenuItem>
                  <MenuItem
                    onClick={() => handleAction('done', group.name)}
                    disabled={
                      isLoading ||
                      group.state === 'done' ||
                      group.state === 'unstarted'
                    }
                  >
                    Mark as done
                  </MenuItem>
                  <MenuItem
                    onClick={() => handleAction('rollback', group.name)}
                    disabled={
                      isLoading ||
                      group.state === 'rolledback' ||
                      group.state === 'unstarted'
                    }
                  >
                    Roll back
                  </MenuItem>
                </MenuButton>
              );

              return (
                <Cell align="right">
                  {!canUpdateRollout ? (
                    <HoverTooltip
                      tipContent={
                        <>
                          You need <code>update</code> permission for{' '}
                          <code>autoupdate_agent_rollout</code> to perform
                          actions on rollout groups.
                        </>
                      }
                    >
                      {button}
                    </HoverTooltip>
                  ) : (
                    button
                  )}
                </Cell>
              );
            },
          },
        ]}
        emptyText="No rollout groups configured"
        initialSort={{
          key: (strategy === 'halt-on-error'
            ? 'position'
            : 'upToDateCount') as keyof RolloutGroupInfo,
          dir: strategy === 'halt-on-error' ? 'ASC' : 'DESC',
        }}
        row={{
          onClick: group =>
            onGroupSelect(selectedGroupName === group.name ? null : group.name),
          getStyle: group =>
            selectedGroupName === group.name
              ? { backgroundColor: theme.colors.interactive.tonal.neutral[1] }
              : undefined,
        }}
      />
    </TableContainer>
  );
}

function GroupDetailsPanel({
  group,
  rollout,
  orphanedAgentVersionCounts,
}: {
  group: RolloutGroupInfo;
  rollout?: RolloutInfo;
  orphanedAgentVersionCounts?: Record<string, number>;
}) {
  const percent = getProgress(group);
  const versionCounts = group.agentVersionCounts || {};
  const versions = new Set(Object.keys(versionCounts));
  // We always show the start and target versions as rows even if their counts are 0.
  if (rollout?.startVersion) versions.add(rollout.startVersion);
  if (rollout?.targetVersion) versions.add(rollout.targetVersion);
  const versionData = Array.from(versions).map(version => ({
    version,
    count: versionCounts[version] || 0,
    isStart: version === rollout?.startVersion,
    isTarget: version === rollout?.targetVersion,
  }));

  const orphanedCount = getOrphanedCount(orphanedAgentVersionCounts);
  const hasOrphanedAgents = orphanedCount > 0;
  const orphanedVersions = new Set(
    Object.keys(orphanedAgentVersionCounts || {})
  );
  if (rollout?.startVersion) orphanedVersions.add(rollout.startVersion);
  if (rollout?.targetVersion) orphanedVersions.add(rollout.targetVersion);
  const orphanedVersionData = hasOrphanedAgents
    ? Array.from(orphanedVersions).map(version => ({
        version,
        count: orphanedAgentVersionCounts?.[version] || 0,
        isStart: version === rollout?.startVersion,
        isTarget: version === rollout?.targetVersion,
      }))
    : [];
  const orphanedUpToDate =
    orphanedAgentVersionCounts?.[rollout?.targetVersion || ''] || 0;
  const orphanedPercent =
    orphanedCount > 0
      ? Math.round((orphanedUpToDate / orphanedCount) * 100)
      : 0;

  return (
    <Box>
      <Box mb={3} mt={3}>
        <H2>{group.name}</H2>
      </Box>

      <Box mb={4}>
        <InfoItem
          label="Status"
          value={<StatusBadge state={group.state} />}
          labelWidth={100}
          mb={2}
        />
        <InfoItem
          label="Progress"
          value={
            <>
              {percent}% complete{' '}
              <Text as="span" color="text.muted">
                ({group.upToDateCount} of {group.presentCount})
              </Text>
            </>
          }
          labelWidth={100}
          mb={2}
        />
        {rollout?.strategy === 'halt-on-error' && (
          <InfoItem
            label="Group Order"
            value={group.position || '-'}
            labelWidth={100}
            mb={2}
          />
        )}
        <InfoItem
          label="Group Count"
          value={
            <Flex flexDirection="column">
              <Flex alignItems="center" gap={1}>
                <Text>{group.presentCount} agent instances</Text>
                <HoverTooltip tipContent="View in instance inventory">
                  <Link
                    href={getInstanceInventoryUrlFilteredByGroup(group.name)}
                    onClick={e => e.stopPropagation()}
                    css={`
                      display: inline-flex;
                      align-items: center;
                    `}
                  >
                    <ArrowSquareOut size="small" color="text.muted" />
                  </Link>
                </HoverTooltip>
              </Flex>
              {group.initialCount > 0 && (
                <Text typography="body2" color="text.muted">
                  {group.initialCount} at start time
                </Text>
              )}
            </Flex>
          }
          labelWidth={100}
          mb={2}
        />
      </Box>

      <VersionTable data={versionData} totalCount={group.presentCount} />

      {hasOrphanedAgents && (
        <Box mt={4}>
          <Text typography="h3" mb={2} color="interactive.solid.alert.default">
            + {orphanedCount} ungrouped agent instances
          </Text>
          <Text typography="body2" color="text.muted" mb={3}>
            Ungrouped agent instances are agent instances not assigned to any
            rollout group defined in the rollout configuration. If detected,
            these ungrouped agent instances are automatically added to the last
            group. <br />
            <br />
            If this is unexpected, double check your cluster&apos;s rollout
            configuration.
          </Text>

          <Box mb={3}>
            <InfoItem
              label="Progress"
              value={
                <>
                  {orphanedPercent}% complete{' '}
                  <Text as="span" color="text.muted">
                    ({orphanedUpToDate} of {orphanedCount})
                  </Text>
                </>
              }
              labelWidth={100}
              mb={2}
            />
            <InfoItem
              label="Group Count"
              value={`${orphanedCount} agent instances`}
              labelWidth={100}
              mb={2}
            />
          </Box>

          <VersionTable data={orphanedVersionData} totalCount={orphanedCount} />
        </Box>
      )}
    </Box>
  );
}

function VersionTable({
  data,
  totalCount,
}: {
  data: Array<{
    version: string;
    count: number;
    isStart: boolean;
    isTarget: boolean;
  }>;
  totalCount: number;
}) {
  return (
    <VersionTableContainer>
      <Table
        data={data}
        columns={[
          {
            key: 'version',
            headerText: 'Version',
            isSortable: true,
            render: item => (
              <Cell>
                <Flex alignItems="center" gap={1}>
                  <Text typography="body2">{item.version}</Text>
                  {item.isStart && (
                    <Text color="text.muted" typography="body2">
                      (Start)
                    </Text>
                  )}
                  {item.isTarget && (
                    <Text color="text.muted" typography="body2">
                      (Target)
                    </Text>
                  )}
                </Flex>
              </Cell>
            ),
          },
          {
            key: 'count',
            headerText: 'Instances Updated',
            isSortable: true,
            render: item => {
              const pct =
                totalCount > 0
                  ? Math.round((item.count / totalCount) * 100)
                  : 0;
              return (
                <Cell>
                  <Flex alignItems="center" gap={2}>
                    <Text typography="body2">{item.count}</Text>
                    <Text typography="body2" color="text.muted">
                      ({pct}%)
                    </Text>
                  </Flex>
                </Cell>
              );
            },
          },
        ]}
        emptyText="No version data found"
        initialSort={{ key: 'version', dir: 'ASC' }}
      />
    </VersionTableContainer>
  );
}

function StatusBadge({ state }: { state: GroupState }) {
  const theme = useTheme();
  const config = {
    done: {
      label: 'Done',
      color: theme.colors.interactive.solid.success.default,
    },
    active: {
      label: 'In progress',
      color: theme.colors.interactive.solid.accent.default,
    },
    canary: {
      label: 'In progress',
      color: theme.colors.interactive.solid.accent.default,
    },
    rolledback: {
      label: 'Rolled back',
      color: theme.colors.interactive.solid.alert.default,
    },
    unstarted: {
      label: 'Scheduled',
      color: theme.colors.interactive.solid.primary.default,
    },
  }[state] || {
    label: 'Scheduled',
    color: theme.colors.interactive.solid.primary.default,
  };

  return (
    <Flex alignItems="center" gap={2}>
      <StatusDot $color={config.color} />
      <Text typography="body2">{config.label}</Text>
    </Flex>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  const theme = useTheme();
  const color =
    percent >= 100
      ? theme.colors.interactive.solid.success.default
      : theme.colors.interactive.solid.accent.default;

  return (
    <ProgressBarContainer>
      <ProgressBarFill $percent={Math.min(percent, 100)} $color={color} />
    </ProgressBarContainer>
  );
}

export function DocsLink({ docsUrl }: { docsUrl: string }) {
  const theme = useTheme();
  return (
    <Link
      href={docsUrl}
      target="_blank"
      css={`
        white-space: nowrap;
        display: inline-flex;
        align-items: center;
        color: ${theme.colors.interactive.solid.primary.default};
        text-decoration: none;
        font-weight: 500;
        &:hover {
          color: ${theme.colors.interactive.solid.primary.hover};
        }
      `}
    >
      See guide in Docs <ArrowSquareOut size="small" ml={1} />
    </Link>
  );
}

/**
 * getProgress returns the rollout progress percentage for a given group.
 */
function getProgress(group: RolloutGroupInfo): number {
  if (group.presentCount === 0) return 0;
  return Math.round((group.upToDateCount / group.presentCount) * 100);
}

/**
 * getOrphanedCount returns the total count of orphaned agents across all versions.
 */
function getOrphanedCount(
  orphanedAgentVersionCounts?: Record<string, number>
): number {
  if (!orphanedAgentVersionCounts) return 0;
  return Object.values(orphanedAgentVersionCounts).reduce((a, b) => a + b, 0);
}

/**
 * getReadableStateReason maps backend state reason values to friendly strings.
 * These should be kept in sync with the backend definitions in lib/autoupdate/rollout
 */
function getReadableStateReason(reason: string): string {
  if (!reason) return 'None';

  const reasonMap: Record<string, string> = {
    can_start: 'Ready to start',
    cannot_start: 'Cannot start',
    previous_groups_not_done: 'Waiting for previous group(s) to complete',
    update_complete: 'Update complete',
    update_in_progress: 'Update in progress',
    canaries_are_alive: 'Canaries are alive',
    waiting_for_canaries: 'Waiting for canaries',
    in_window: 'In maintenance window',
    outside_window: 'Outside maintenance window',
    created: 'Created',
    reconciler_error: 'Reconciler error',
    rollout_changed_during_window: 'Rollout changed during window',
    manual_trigger: 'Manually triggered',
    manual_forced_done: 'Manually marked as done',
    manual_rollback: 'Manually rolled back',
  };
  return reasonMap[reason] || reason;
}

function getInstanceInventoryUrlFilteredByGroup(groupName: string): string {
  const query = encodeURIComponent(`spec.updater_group == "${groupName}"`);
  return `${cfg.routes.instances}?query=${query}&is_advanced=true`;
}

const TableContainer = styled(Box)`
  border: 1px solid ${p => p.theme.colors.interactive.tonal.neutral[2]};
  border-radius: ${p => p.theme.radii[3]}px;
  overflow-x: auto;

  table {
    border-collapse: collapse;
    width: 100%;

    thead tr {
      background-color: ${p => p.theme.colors.levels.elevated};
      cursor: default;
      &:hover {
        background-color: ${p => p.theme.colors.levels.elevated};
      }
    }

    thead > tr > th {
      ${p => p.theme.typography.h3};
      padding-top: ${p => p.theme.space[2]}px;
      padding-bottom: ${p => p.theme.space[2]}px;
      text-align: left;
      color: ${p => p.theme.colors.text.main};
      border-bottom: 1px solid
        ${p => p.theme.colors.interactive.tonal.neutral[2]};
    }

    tbody tr {
      cursor: pointer;
      transition: background-color 0.15s ease;
      height: 68px;
      &:hover {
        background-color: ${p => p.theme.colors.interactive.tonal.neutral[0]};
      }
      &:not(:last-child) {
        border-bottom: 1px solid
          ${p => p.theme.colors.interactive.tonal.neutral[0]};
      }
    }

    td {
      padding: ${p => p.theme.space[2]}px;
      vertical-align: middle;
    }
  }
`;

const VersionTableContainer = styled(TableContainer)`
  table {
    thead > tr > th {
      padding-top: ${p => p.theme.space[1]}px;
      padding-bottom: ${p => p.theme.space[1]}px;
    }
    tbody tr {
      height: auto;
      // Remove hover effects on the rows
      cursor: unset;
      &:hover {
        background-color: transparent;
        border-color: ${p => p.theme.colors.interactive.tonal.neutral[0]};
      }
      &:hover:after {
        box-shadow: none;
      }
      &:hover + tr {
        border-color: ${p => p.theme.colors.interactive.tonal.neutral[0]};
      }
    }
  }
`;

const StatusDot = styled(Box)<{ $color: string }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: ${p => p.$color};
`;

const ProgressBarContainer = styled(Box)`
  width: 100%;
  height: 6px;
  background-color: ${p => p.theme.colors.interactive.tonal.neutral[1]};
  border-radius: ${p => p.theme.radii[2]}px;
  overflow: hidden;
`;

const ProgressBarFill = styled(Box)<{ $percent: number; $color: string }>`
  width: ${p => p.$percent}%;
  height: 100%;
  background-color: ${p => p.$color};
  border-radius: ${p => p.theme.radii[2]}px;
  transition: width 0.3s ease;
`;
