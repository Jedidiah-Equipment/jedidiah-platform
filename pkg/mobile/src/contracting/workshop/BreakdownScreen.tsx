import { formatNumber } from '@pkg/domain';
import {
  breakdownStatusColorClassNames,
  breakdownStatusLabels,
  breakdownUrgencyColorClassNames,
  breakdownUrgencyLabels,
  fieldJobAccessMode,
} from '@pkg/domain/contracting';
import {
  BREAKDOWN_MAX_PHOTOS,
  BreakdownDescription,
  type BreakdownDetail,
  BreakdownNoteText,
  CloseOutNote,
} from '@pkg/schema/contracting';
import { IconCamera, IconMapPin, IconPhoto, IconX } from '@tabler/icons-react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DateText } from '@/components/DateText';
import { useAppForm } from '@/components/form';
import { FieldShell } from '@/components/form/fields/FieldShell';
import { SECONDARY_PAGE_CONTENT_STYLE } from '@/components/page-frame';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { StatusBadge } from '@/components/ui/status-badge';
import { Text } from '@/components/ui/text';
import { CategoryIcon } from '@/contracting/components/CategoryIcon';
import { saveToGallery } from '@/contracting/field-notes/files';
import { choosePhotos, takePhoto } from '@/contracting/field-notes/pick-photos';
import { useVoiceSession } from '@/contracting/voice/use-voice-session';
import { VoiceTextArea } from '@/contracting/voice/VoiceTextArea';
import { useSessionAccessSummary } from '@/lib/auth-session';
import { confirm } from '@/lib/confirm';
import { useTRPC } from '@/lib/trpc';
import { useBusyAction } from '@/lib/use-busy-action';
import { useBreakdownPhotoSource } from './breakdown-photo-source';
import { addBreakdownPhotos, BreakdownRefusedError, PHOTOS_FAILED } from './breakdown-upload';
import { useBreakdown, useMechanics } from './use-breakdowns';
import { VerdictButton } from './VerdictButton';

const SAVE_FAILED = 'Could not save. Check your connection and try again.';

export default function BreakdownScreen() {
  const { breakdownId } = useLocalSearchParams<{ breakdownId: string }>();
  const query = useBreakdown(breakdownId);
  const breakdown = query.data;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <SecondaryToolbar
        title={breakdown?.subject.code ?? 'Breakdown'}
        subtitle={breakdown ? breakdownUrgencyLabels[breakdown.urgency] : 'CONTRACTING'}
        parentLabel="Workshop"
        onBack={() => router.navigate('/contracting/workshop' as Href)}
        helpTopic="contractingMobileBreakdown"
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ ...SECONDARY_PAGE_CONTENT_STYLE, gap: 16 }}
      >
        {breakdown ? (
          <BreakdownSections breakdown={breakdown} />
        ) : (
          <Text className="text-muted-foreground">
            {!query.canRead
              ? 'Your role cannot view Breakdowns.'
              : query.gone
                ? 'This Breakdown is not one of yours, or it no longer exists.'
                : query.isError
                  ? 'This Breakdown could not be loaded.'
                  : 'Loading Breakdown…'}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function BreakdownSections({ breakdown }: { breakdown: BreakdownDetail }) {
  return (
    <>
      <HeaderCard breakdown={breakdown} />
      {breakdown.dispatchHints.length ? <DispatchHints breakdown={breakdown} /> : null}
      <DescriptionCard breakdown={breakdown} />
      <PhotosCard breakdown={breakdown} />
      <WorkshopCard breakdown={breakdown} />
      <NotesCard breakdown={breakdown} />
    </>
  );
}

function useInvalidateBreakdowns() {
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  return () => queryClient.invalidateQueries({ queryKey: trpc.contractingBreakdowns.pathKey() });
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View className="gap-3 rounded-xl border border-border bg-surface p-4">
      {title ? (
        <Text className="text-lg text-foreground" weight="bold">
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

function HeaderCard({ breakdown }: { breakdown: BreakdownDetail }) {
  const canOpenJobs = fieldJobAccessMode(useSessionAccessSummary()) !== null;
  const { subject, latitude, longitude } = breakdown;
  return (
    <Card>
      <View className="flex-row flex-wrap gap-1">
        <StatusBadge
          classNames={breakdownUrgencyColorClassNames[breakdown.urgency]}
          label={breakdownUrgencyLabels[breakdown.urgency]}
        />
        <StatusBadge
          classNames={breakdownStatusColorClassNames[breakdown.status]}
          label={breakdownStatusLabels[breakdown.status]}
        />
      </View>
      <View className="flex-row items-center gap-3">
        <CategoryIcon icon={subject.categoryIcon} colour={subject.categoryColour} size={24} />
        <View className="min-w-0 flex-1">
          <Text className="text-lg text-foreground" weight="bold">
            {subject.code}
          </Text>
          <Text className="text-sm text-muted-foreground">
            {subject.kind === 'machine' ? 'Machine' : 'Implement'} · {subject.categoryName}
          </Text>
        </View>
      </View>
      {breakdown.jobId && breakdown.jobNumber ? (
        <Pressable
          accessibilityRole={canOpenJobs ? 'link' : undefined}
          disabled={!canOpenJobs}
          onPress={() => router.navigate(`/contracting/jobs/${breakdown.jobId}` as Href)}
        >
          <Text className={canOpenJobs ? 'text-primary' : 'text-foreground'} weight="semibold">
            {breakdown.jobNumber}
            {breakdown.farmName ? ` · ${breakdown.farmName}` : ''}
          </Text>
        </Pressable>
      ) : (
        <Text className="text-muted-foreground">Not on a Job</Text>
      )}
      <Text className="text-sm text-muted-foreground">
        Reported <DateText className="text-sm text-muted-foreground" date={breakdown.reportedAt} format="medium" /> by{' '}
        {breakdown.reporterName}
      </Text>
      {latitude !== null && longitude !== null ? (
        <Button
          title="Open in Maps"
          icon={IconMapPin}
          onPress={() => void Linking.openURL(`https://maps.google.com/?q=${latitude},${longitude}`)}
        />
      ) : null}
    </Card>
  );
}

function DispatchHints({ breakdown }: { breakdown: BreakdownDetail }) {
  return (
    <Card title="Also open on this Job">
      {breakdown.dispatchHints.map((hint) => (
        <Pressable
          key={hint.breakdownId}
          accessibilityRole="button"
          className="flex-row items-center gap-2"
          onPress={() =>
            router.push({ pathname: '/contracting/workshop/[breakdownId]', params: { breakdownId: hint.breakdownId } })
          }
        >
          <CategoryIcon icon={hint.subject.categoryIcon} colour={hint.subject.categoryColour} size={16} />
          <Text className="min-w-0 flex-1 text-sm text-foreground" numberOfLines={1}>
            {hint.subject.code} · {breakdownUrgencyLabels[hint.urgency]} · {hint.firstLine}
          </Text>
        </Pressable>
      ))}
    </Card>
  );
}

function DescriptionCard({ breakdown }: { breakdown: BreakdownDetail }) {
  const trpc = useTRPC();
  const invalidate = useInvalidateBreakdowns();
  const patch = useMutation(trpc.contractingBreakdowns.patch.mutationOptions());
  const voice = useVoiceSession('breakdown description');
  const [draft, setDraft] = useState<string | null>(null);
  const { busy, error, run } = useBusyAction();
  const valid = draft !== null && BreakdownDescription.safeParse(draft).success;
  const save = () => {
    if (draft === null || !valid) return;
    void run(async () => {
      await patch.mutateAsync({ id: breakdown.id, description: draft });
      voice.reportSaved(draft.trim());
      setDraft(null);
      await invalidate();
    }, SAVE_FAILED);
  };
  return (
    <Card title="Description">
      {draft === null ? (
        <>
          <Text className="text-foreground">{breakdown.description}</Text>
          {breakdown.actions.editReport.allowed ? (
            <Button title="Edit" onPress={() => setDraft(breakdown.description)} />
          ) : null}
        </>
      ) : (
        <>
          <VoiceTextArea
            accessibilityLabel="What's wrong"
            value={draft}
            editable={!busy}
            rows={5}
            maxLength={BreakdownDescription.maxLength ?? undefined}
            onChangeText={setDraft}
            voice={voice}
          />
          {error ? <Text className="text-danger">{error}</Text> : null}
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button
                title="Cancel"
                disabled={busy}
                onPress={() => {
                  voice.reset();
                  setDraft(null);
                }}
              />
            </View>
            <View className="flex-1">
              <Button
                primary
                title={busy ? 'Saving…' : 'Save'}
                disabled={busy || voice.busy || !valid}
                onPress={save}
              />
            </View>
          </View>
        </>
      )}
    </Card>
  );
}

function PhotosCard({ breakdown }: { breakdown: BreakdownDetail }) {
  const trpc = useTRPC();
  const invalidate = useInvalidateBreakdowns();
  const remove = useMutation(trpc.contractingBreakdowns.removePhoto.mutationOptions());
  const [viewing, setViewing] = useState<string | null>(null);
  const { busy, error, setError, run } = useBusyAction();
  const canChange = breakdown.actions.addPhotos.allowed;
  const left = BREAKDOWN_MAX_PHOTOS - breakdown.photos.length;
  const upload = (pick: () => Promise<{ uri: string; source: string }[]>) =>
    run(async () => {
      const picked = await pick();
      if (!picked.length) return;
      for (const photo of picked.filter((candidate) => candidate.source === 'camera'))
        void saveToGallery(photo.uri).catch(() => undefined);
      try {
        await addBreakdownPhotos(
          breakdown.id,
          picked.slice(0, left).map((photo) => photo.uri),
        );
      } catch (uploadError) {
        if (uploadError instanceof BreakdownRefusedError) {
          setError(uploadError.message);
          return;
        }
        throw uploadError;
      }
      await invalidate();
    }, PHOTOS_FAILED);
  const removePhoto = async (photoId: string) => {
    if (!(await confirm({ title: 'Remove this photo?', confirmLabel: 'Remove', destructive: true }))) return;
    await run(async () => {
      await remove.mutateAsync({ id: breakdown.id, photoId });
      await invalidate();
    }, SAVE_FAILED);
  };
  return (
    <Card title={`Photos · ${formatNumber(breakdown.photos.length)}`}>
      {breakdown.photos.length ? (
        <ScrollView horizontal contentContainerStyle={{ gap: 8 }} showsHorizontalScrollIndicator={false}>
          {breakdown.photos.map((photo, index) => (
            <View key={photo.id} className="h-28 w-28 overflow-hidden rounded-xl bg-image-backdrop">
              <Pressable
                accessibilityLabel={`Open Breakdown photo ${formatNumber(index + 1)}`}
                accessibilityRole="imagebutton"
                className="h-full w-full"
                onPress={() => setViewing(photo.id)}
              >
                <BreakdownPhoto breakdownId={breakdown.id} photoId={photo.id} resizeMode="cover" />
              </Pressable>
              {canChange ? (
                <Pressable
                  accessibilityLabel={`Remove photo ${formatNumber(index + 1)}`}
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void removePhoto(photo.id)}
                  className="absolute right-1 top-1 h-8 w-8 items-center justify-center rounded-full bg-black/60"
                >
                  <Icon className="text-white" icon={IconX} size={16} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </ScrollView>
      ) : (
        <Text className="text-muted-foreground">No photos.</Text>
      )}
      {error ? <Text className="text-danger">{error}</Text> : null}
      {canChange && left > 0 ? (
        <>
          <Button title="Take photo" icon={IconCamera} disabled={busy} onPress={() => void upload(takePhoto)} />
          <Button
            title="Choose from gallery"
            icon={IconPhoto}
            disabled={busy}
            onPress={() => void upload(() => choosePhotos(left))}
          />
        </>
      ) : null}
      <Modal visible={viewing !== null} animationType="fade" onRequestClose={() => setViewing(null)}>
        <SafeAreaView className="flex-1 bg-black">
          <Pressable
            accessibilityLabel="Close photo"
            accessibilityRole="button"
            className="absolute right-4 top-12 z-10 h-10 w-10 items-center justify-center rounded-full bg-black/60"
            onPress={() => setViewing(null)}
          >
            <Icon className="text-white" icon={IconX} size={20} />
          </Pressable>
          {viewing ? <BreakdownPhoto breakdownId={breakdown.id} photoId={viewing} resizeMode="contain" /> : null}
        </SafeAreaView>
      </Modal>
    </Card>
  );
}

function BreakdownPhoto({
  breakdownId,
  photoId,
  resizeMode,
}: {
  breakdownId: string;
  photoId: string;
  resizeMode: 'cover' | 'contain';
}) {
  const source = useBreakdownPhotoSource(breakdownId, photoId);
  if (source.kind !== 'ready')
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-xs text-muted-foreground">{source.kind === 'loading' ? 'Loading…' : 'Unavailable'}</Text>
      </View>
    );
  // Explicit dimensions avoid react-native-web falling back to the image's intrinsic size.
  return <Image source={{ uri: source.uri }} resizeMode={resizeMode} style={{ height: '100%', width: '100%' }} />;
}

function WorkshopCard({ breakdown }: { breakdown: BreakdownDetail }) {
  const trpc = useTRPC();
  const invalidate = useInvalidateBreakdowns();
  const assign = useMutation(trpc.contractingBreakdowns.assignMechanic.mutationOptions());
  const start = useMutation(trpc.contractingBreakdowns.start.mutationOptions());
  const mechanics = useMechanics();
  const { busy, error, run } = useBusyAction();
  const [solving, setSolving] = useState(false);
  const { actions } = breakdown;
  const picker = useAppForm({ defaultValues: { mechanicUserId: breakdown.primaryMechanicUserId ?? '' } });
  const assignMechanic = () =>
    run(async () => {
      await assign.mutateAsync({ id: breakdown.id, mechanicUserId: picker.state.values.mechanicUserId || null });
      await invalidate();
    }, SAVE_FAILED);
  return (
    <Card title="Workshop">
      {actions.assignMechanic.allowed ? (
        <picker.AppField name="mechanicUserId">
          {(field) => (
            <field.SearchSelectField
              label="Mechanic"
              placeholder="No Mechanic yet"
              searchPlaceholder="Search Mechanics…"
              emptyMessage="No Mechanics match."
              disabled={busy}
              onValueCommit={() => void assignMechanic()}
              options={[
                { label: 'No Mechanic yet', value: '' },
                ...(mechanics.data ?? []).map((mechanic) => ({ label: mechanic.name, value: mechanic.id })),
              ]}
            />
          )}
        </picker.AppField>
      ) : (
        <Text className="text-foreground">Mechanic: {breakdown.mechanicName ?? 'not assigned yet'}</Text>
      )}
      {breakdown.startedAt ? (
        <Text className="text-sm text-muted-foreground">
          Started <DateText className="text-sm text-muted-foreground" date={breakdown.startedAt} format="medium" />
        </Text>
      ) : null}
      {breakdown.solvedAt ? (
        <Text className="text-sm text-muted-foreground">
          Solved <DateText className="text-sm text-muted-foreground" date={breakdown.solvedAt} format="medium" />
        </Text>
      ) : null}
      {breakdown.closeOutNote ? (
        <FieldShell label="Close-out note">
          <Text className="text-foreground">{breakdown.closeOutNote}</Text>
        </FieldShell>
      ) : null}
      {error ? <Text className="text-danger">{error}</Text> : null}
      {breakdown.status === 'open' ? (
        <VerdictButton
          verdict={actions.start}
          title="Start work"
          busy={busy}
          onPress={() =>
            void run(async () => {
              await start.mutateAsync({ id: breakdown.id });
              await invalidate();
            }, SAVE_FAILED)
          }
        />
      ) : null}
      <VerdictButton verdict={actions.solve} title="Mark solved" primary busy={busy} onPress={() => setSolving(true)} />
      <SolveModal breakdownId={breakdown.id} visible={solving} onClose={() => setSolving(false)} />
    </Card>
  );
}

/** Solving needs a close-out note, so a plain confirm is not enough. */
function SolveModal({ breakdownId, visible, onClose }: { breakdownId: string; visible: boolean; onClose: () => void }) {
  const trpc = useTRPC();
  const invalidate = useInvalidateBreakdowns();
  const solve = useMutation(trpc.contractingBreakdowns.solve.mutationOptions());
  const voice = useVoiceSession('close-out note');
  const [note, setNote] = useState('');
  const { busy, error, run } = useBusyAction();
  const valid = CloseOutNote.safeParse(note).success;
  const close = () => {
    if (busy) return;
    voice.reset();
    setNote('');
    onClose();
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View className="flex-1 justify-end bg-black/50">
        <SafeAreaView edges={['bottom']} className="gap-3 rounded-t-2xl bg-background p-4">
          <Text className="text-lg text-foreground" weight="bold">
            Mark solved
          </Text>
          <FieldShell label="Close-out note">
            <VoiceTextArea
              accessibilityLabel="Close-out note"
              placeholder="What was wrong and what was done"
              value={note}
              editable={!busy}
              rows={4}
              maxLength={CloseOutNote.maxLength ?? undefined}
              onChangeText={setNote}
              voice={voice}
            />
          </FieldShell>
          {error ? <Text className="text-danger">{error}</Text> : null}
          <Button
            destructive
            title={busy ? 'Saving…' : 'Confirm solved'}
            disabled={busy || voice.busy || !valid}
            onPress={() =>
              void run(async () => {
                await solve.mutateAsync({ id: breakdownId, closeOutNote: note });
                voice.reportSaved(note.trim());
                setNote('');
                onClose();
                await invalidate();
              }, SAVE_FAILED)
            }
          />
          <Button title="Cancel" disabled={busy} onPress={close} />
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function NotesCard({ breakdown }: { breakdown: BreakdownDetail }) {
  const trpc = useTRPC();
  const invalidate = useInvalidateBreakdowns();
  const add = useMutation(trpc.contractingBreakdowns.notes.add.mutationOptions());
  const voice = useVoiceSession('breakdown note');
  const [text, setText] = useState('');
  const { busy, error, run } = useBusyAction();
  const valid = BreakdownNoteText.safeParse(text).success;
  return (
    <Card title="Notes">
      {breakdown.notes.length ? (
        breakdown.notes.map((note) => (
          <View key={note.id} className="gap-1 border-b border-border pb-3">
            <Text className="text-sm text-muted-foreground">
              {note.authorName} ·{' '}
              <DateText className="text-sm text-muted-foreground" date={note.createdAt} format="medium" />
            </Text>
            <Text className="text-foreground">{note.text}</Text>
          </View>
        ))
      ) : (
        <Text className="text-muted-foreground">No notes yet.</Text>
      )}
      {breakdown.actions.addNote.allowed ? (
        <>
          <VoiceTextArea
            accessibilityLabel="New note"
            placeholder="Ask or answer a question"
            value={text}
            editable={!busy}
            rows={3}
            maxLength={BreakdownNoteText.maxLength ?? undefined}
            onChangeText={setText}
            voice={voice}
          />
          {error ? <Text className="text-danger">{error}</Text> : null}
          <Button
            title={busy ? 'Adding…' : 'Add note'}
            disabled={busy || voice.busy || !valid}
            onPress={() =>
              void run(async () => {
                await add.mutateAsync({ breakdownId: breakdown.id, text });
                voice.reportSaved(text.trim());
                setText('');
                await invalidate();
              }, SAVE_FAILED)
            }
          />
        </>
      ) : null}
    </Card>
  );
}
