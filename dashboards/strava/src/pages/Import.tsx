import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { UploadCloud, FileUp, Loader2, CheckCircle2, AlertTriangle, FileArchive } from 'lucide-react'
import {
  deleteFailedImportQueueJobs,
  deleteImportQueueJob,
  getImportMetrics,
  getImportQueueFailedJobs,
  getImportQueueStatus,
  getImportRun,
  getImportRuns,
  getWatchFolderStatus,
  requeueFailedImportQueueJobs,
  requeueImportQueueJob,
  retryFailedImportRunFiles,
  triggerWatchFolderRescan,
  uploadImportBatch,
  uploadImportFile,
  uploadStravaExportZip,
  type ImportBatchResponse,
  type ImportSingleResponse,
} from '../lib/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'

const getApiErrorInfo = (error: unknown): { status: number; responseData: unknown; message: string | null } => {
  if (!error || typeof error !== 'object') {
    return { status: 0, responseData: null, message: null }
  }
  const errorRecord = error as Record<string, unknown>
  const message = typeof errorRecord.message === 'string' ? errorRecord.message : null
  const response = (typeof errorRecord.response === 'object' && errorRecord.response !== null)
    ? (errorRecord.response as Record<string, unknown>)
    : null
  const status = Number(response?.status || 0)
  return {
    status,
    responseData: response?.data,
    message,
  }
}

type UploadResult = {
  importId: number
  files: Array<{
    filename: string
    status: 'queued' | 'processing' | 'done' | 'duplicate' | 'failed'
    message: string
    activityId?: number
    detectedFormat?: string
  }>
}

type StravaZipUploadProgress = {
  filename: string
  phase: 'uploading' | 'processing'
  bytesSent: number
  bytesTotal?: number
  percent?: number
  resumedFromBytes?: number
}

type ImportProgressSummary = {
  total: number
  imported: number
  duplicates: number
  failed: number
  processing: number
  queued: number
  completedFinal: number
  open: number
  progressRatio: number
}

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, idx)
  return `${value.toFixed(value >= 100 || idx === 0 ? 0 : 1)} ${units[idx]}`
}

const acceptedExt = ['.fit', '.fit.gz', '.gpx', '.gpx.gz', '.tcx', '.tcx.gz', '.csv', '.csv.gz', '.zip']
const metricsWindowDays = 30
const failedQueueLimit = 20

type ImportPageMode = 'simple' | 'full'

interface ImportPageProps {
  mode?: ImportPageMode
}

export default function ImportPage({ mode = 'simple' }: ImportPageProps) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [files, setFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const stravaZipInputRef = useRef<HTMLInputElement | null>(null)
  const [stravaExportIncludeMedia, setStravaExportIncludeMedia] = useState(false)
  const [stravaZipUploadProgress, setStravaZipUploadProgress] = useState<StravaZipUploadProgress | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [selectedImportId, setSelectedImportId] = useState<number | null>(null)
  const [lastUpload, setLastUpload] = useState<UploadResult | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(mode === 'full')
  const isSimpleMode = mode === 'simple'
  const advancedVisible = mode === 'full' || showAdvanced

  const { data: runsData, isLoading: isRunsLoading } = useQuery({
    queryKey: ['imports'],
    queryFn: () => getImportRuns(isSimpleMode ? 20 : 50),
    refetchInterval: 20000,
  })

  const { data: selectedImportData, isLoading: isImportDetailLoading } = useQuery({
    queryKey: ['import-run', selectedImportId],
    queryFn: () => getImportRun(selectedImportId as number),
    enabled: selectedImportId !== null,
    refetchInterval: selectedImportId !== null ? 3000 : false,
  })
  const { data: metricsData, isLoading: isMetricsLoading } = useQuery({
    queryKey: ['import-metrics', metricsWindowDays],
    queryFn: () => getImportMetrics(metricsWindowDays),
    enabled: advancedVisible,
    refetchInterval: advancedVisible ? 30000 : false,
  })
  const { data: queueStatusData, isLoading: isQueueStatusLoading } = useQuery({
    queryKey: ['import-queue-status'],
    queryFn: getImportQueueStatus,
    enabled: advancedVisible,
    refetchInterval: advancedVisible ? 7000 : false,
  })
  const { data: failedQueueJobsData, isLoading: isFailedQueueJobsLoading } = useQuery({
    queryKey: ['import-queue-failed-jobs'],
    queryFn: () => getImportQueueFailedJobs(failedQueueLimit),
    enabled: advancedVisible,
    refetchInterval: advancedVisible ? 10000 : false,
  })
  const { data: watchStatus, isLoading: isWatchLoading } = useQuery({
    queryKey: ['watch-folder-status'],
    queryFn: getWatchFolderStatus,
    enabled: advancedVisible,
    refetchInterval: advancedVisible ? 15000 : false,
  })

  const rescanMutation = useMutation({
    mutationFn: triggerWatchFolderRescan,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['watch-folder-status'] })
      await queryClient.invalidateQueries({ queryKey: ['imports'] })
      await queryClient.invalidateQueries({ queryKey: ['import-metrics'] })
      await queryClient.invalidateQueries({ queryKey: ['import-queue-status'] })
      await queryClient.invalidateQueries({ queryKey: ['import-queue-failed-jobs'] })
    },
  })
  const retryFailedMutation = useMutation({
    mutationFn: (importId: number) => retryFailedImportRunFiles(importId),
    onSuccess: async (_, importId) => {
      await queryClient.invalidateQueries({ queryKey: ['imports'] })
      await queryClient.invalidateQueries({ queryKey: ['import-run', importId] })
      await queryClient.invalidateQueries({ queryKey: ['import-metrics'] })
      await queryClient.invalidateQueries({ queryKey: ['import-queue-status'] })
      await queryClient.invalidateQueries({ queryKey: ['import-queue-failed-jobs'] })
    },
  })
  const requeueQueueJobMutation = useMutation({
    mutationFn: (jobId: number) => requeueImportQueueJob(jobId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['imports'] })
      await queryClient.invalidateQueries({ queryKey: ['import-queue-status'] })
      await queryClient.invalidateQueries({ queryKey: ['import-queue-failed-jobs'] })
      if (selectedImportId) {
        await queryClient.invalidateQueries({ queryKey: ['import-run', selectedImportId] })
      }
    },
  })
  const requeueVisibleQueueJobsMutation = useMutation({
    mutationFn: () => requeueFailedImportQueueJobs({ limit: failedQueueLimit }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['imports'] })
      await queryClient.invalidateQueries({ queryKey: ['import-queue-status'] })
      await queryClient.invalidateQueries({ queryKey: ['import-queue-failed-jobs'] })
      if (selectedImportId) {
        await queryClient.invalidateQueries({ queryKey: ['import-run', selectedImportId] })
      }
    },
  })
  const deleteQueueJobMutation = useMutation({
    mutationFn: (jobId: number) => deleteImportQueueJob(jobId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['import-queue-status'] })
      await queryClient.invalidateQueries({ queryKey: ['import-queue-failed-jobs'] })
    },
  })
  const deleteVisibleQueueJobsMutation = useMutation({
    mutationFn: () => deleteFailedImportQueueJobs({ limit: failedQueueLimit }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['import-queue-status'] })
      await queryClient.invalidateQueries({ queryKey: ['import-queue-failed-jobs'] })
    },
  })

  const applyUploadResult = async (parsed: UploadResult) => {
    setLastUpload(parsed)
    setSelectedImportId(parsed.importId)
    setFiles([])
    await queryClient.invalidateQueries({ queryKey: ['imports'] })
    await queryClient.invalidateQueries({ queryKey: ['import-run', parsed.importId] })
    await queryClient.invalidateQueries({ queryKey: ['import-metrics'] })
    await queryClient.invalidateQueries({ queryKey: ['import-queue-status'] })
    await queryClient.invalidateQueries({ queryKey: ['import-queue-failed-jobs'] })
  }

  const uploadMutation = useMutation({
    mutationFn: async (selectedFiles: File[]) => {
      const singleFile = selectedFiles.length === 1 ? selectedFiles[0] : null
      const isSingleZip = singleFile ? singleFile.name.toLowerCase().endsWith('.zip') : false
      if (selectedFiles.length === 1 && !isSingleZip) {
        const single = await uploadImportFile(selectedFiles[0])
        return {
          kind: 'single' as const,
          data: single,
        }
      }
      const batch = await uploadImportBatch(selectedFiles)
      return {
        kind: 'batch' as const,
        data: batch,
      }
    },
    onSuccess: async (result) => {
      let parsed: UploadResult

      if (result.kind === 'single') {
        const single = result.data as ImportSingleResponse
        parsed = {
          importId: single.importId,
          files: [
            {
              filename: files[0]?.name || `file-${single.importId}`,
              status: single.status,
              message: single.message,
              activityId: single.activityId,
              detectedFormat: single.detectedFormat,
            },
          ],
        }
      } else {
        const batch = result.data as ImportBatchResponse
        parsed = {
          importId: batch.importId,
          files: batch.files.map((file) => ({
            filename: file.originalFilename,
            status: file.status,
            message: file.message,
            activityId: file.activityId,
            detectedFormat: file.detectedFormat,
          })),
        }
      }

      await applyUploadResult(parsed)
    },
  })

  const stravaExportZipMutation = useMutation({
    mutationFn: async (zipFile: File) => {
      setStravaZipUploadProgress({
        filename: zipFile.name,
        phase: 'uploading',
        bytesSent: 0,
        bytesTotal: zipFile.size,
        percent: 0,
      })

      const batch = await uploadStravaExportZip(zipFile, {
        includeMedia: stravaExportIncludeMedia,
        onResumeDetected: (info) => {
          const total = zipFile.size || undefined
          const percent = total
            ? Math.min(100, Math.max(0, Math.round((info.receivedBytes / total) * 100)))
            : undefined
          setStravaZipUploadProgress((prev) => ({
            filename: prev?.filename || zipFile.name,
            phase: 'uploading',
            bytesSent: info.receivedBytes,
            bytesTotal: total,
            percent,
            resumedFromBytes: info.receivedBytes,
          }))
        },
        onUploadProgress: (event) => {
          const loaded = Number(event.loaded || 0)
          const total = Number(event.total || zipFile.size || 0) || undefined
          const percent = total
            ? Math.min(100, Math.max(0, Math.round((loaded / total) * 100)))
            : (typeof event.progress === 'number'
              ? Math.min(100, Math.max(0, Math.round(event.progress * 100)))
              : undefined)
          const uploadComplete = total
            ? loaded >= total
            : (typeof event.progress === 'number' && event.progress >= 1)

          setStravaZipUploadProgress((prev) => ({
            filename: zipFile.name,
            phase: uploadComplete ? 'processing' : 'uploading',
            bytesSent: loaded,
            bytesTotal: total,
            percent,
            resumedFromBytes: prev?.resumedFromBytes,
          }))
        },
      })

      setStravaZipUploadProgress((prev) => prev
        ? {
          ...prev,
          phase: 'processing',
          percent: 100,
          bytesSent: prev.bytesTotal ?? prev.bytesSent,
        }
        : {
          filename: zipFile.name,
          phase: 'processing',
          bytesSent: zipFile.size,
          bytesTotal: zipFile.size,
          percent: 100,
        })

      return {
        importId: batch.importId,
        files: batch.files.map((file) => ({
          filename: file.originalFilename,
          status: file.status,
          message: file.message,
          activityId: file.activityId,
          detectedFormat: file.detectedFormat,
        })),
      } as UploadResult
    },
    onSuccess: async (parsed) => {
      await applyUploadResult(parsed)
    },
    onSettled: () => {
      setStravaZipUploadProgress(null)
    },
  })

  const dateLocale = i18n.language?.startsWith('de') ? 'de-DE' : 'en-US'
  const formatDateTime = (value?: string | null) => {
    if (!value) return '—'
    return new Intl.DateTimeFormat(dateLocale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  }

  useEffect(() => {
    if (!isSimpleMode) return
    if (selectedImportId !== null) return
    const mostRecent = runsData?.imports?.[0]
    if (mostRecent?.id) {
      setSelectedImportId(Number(mostRecent.id))
    }
  }, [isSimpleMode, runsData?.imports, selectedImportId])

  const totals = useMemo(() => {
    return {
      files: files.length,
      bytes: files.reduce((sum, file) => sum + file.size, 0),
    }
  }, [files])
  const recentRuns = useMemo(() => {
    const imports = runsData?.imports || []
    return imports.slice(0, isSimpleMode ? 8 : 50)
  }, [runsData?.imports, isSimpleMode])

  const onFilesSelected = (incoming: FileList | null) => {
    if (!incoming) return
    const next = Array.from(incoming).filter((file) => {
      const lower = file.name.toLowerCase()
      return acceptedExt.some((ext) => lower.endsWith(ext))
    })
    setFiles(next)
  }

  const openFileDialog = () => {
    fileInputRef.current?.click()
  }
  const openStravaZipDialog = () => {
    stravaZipInputRef.current?.click()
  }

  const statusBadge = (status: string) => {
    if (status === 'done' || status === 'ok') {
      return <Badge className="bg-green-500/15 text-green-600 border-green-500/20">{t('import.status.done')}</Badge>
    }
    if (status === 'duplicate' || status === 'skipped_duplicate') {
      return <Badge className="bg-yellow-500/15 text-yellow-700 border-yellow-500/20">{t('import.status.duplicate')}</Badge>
    }
    if (status === 'queued') {
      return <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/20">{t('import.status.queued')}</Badge>
    }
    if (status === 'processing') {
      return <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/20">{t('import.status.processing')}</Badge>
    }
    return <Badge className="bg-red-500/15 text-red-600 border-red-500/20">{t('import.status.failed')}</Badge>
  }
  const formatPercent = (value: number) => `${(Math.max(0, value) * 100).toFixed(1)}%`

  const selectedFailedCount = selectedImportData?.files?.filter((file) => file.status === 'failed').length || 0
  const mapImportFileStatus = (status: string): UploadResult['files'][number]['status'] => (
    status === 'ok'
      ? 'done'
      : status === 'skipped_duplicate'
        ? 'duplicate'
        : (status as UploadResult['files'][number]['status'])
  )

  const mapImportFileMessage = (status: string, errorMessage?: string | null): string => (
    errorMessage
    || (status === 'ok'
      ? 'Imported'
      : status === 'skipped_duplicate'
        ? 'Duplicate'
        : status === 'processing'
          ? 'Processing...'
          : status === 'queued'
            ? 'Queued...'
            : 'Failed')
  )

  const liveLastUpload = useMemo<UploadResult | null>(() => {
    if (isSimpleMode && selectedImportData) {
      return {
        importId: Number(selectedImportData.import.id),
        files: selectedImportData.files.map((file) => ({
          filename: file.original_filename,
          status: mapImportFileStatus(file.status),
          message: mapImportFileMessage(file.status, file.error_message),
          activityId: file.activity_id || undefined,
          detectedFormat: file.detected_format || undefined,
        })),
      }
    }

    if (!lastUpload) return null
    if (!selectedImportData) return lastUpload
    if (Number(selectedImportData.import.id) !== Number(lastUpload.importId)) return lastUpload

    return {
      importId: lastUpload.importId,
      files: selectedImportData.files.map((file) => ({
        filename: file.original_filename,
        status: mapImportFileStatus(file.status),
        message: mapImportFileMessage(file.status, file.error_message),
        activityId: file.activity_id || undefined,
        detectedFormat: file.detected_format || undefined,
      })),
    }
  }, [isSimpleMode, lastUpload, selectedImportData])

  const liveLastUploadRunStatus = (() => {
    if (!liveLastUpload || !selectedImportData) return null
    return Number(selectedImportData.import.id) === Number(liveLastUpload.importId)
      ? selectedImportData.import.status
      : null
  })()

  const liveLastUploadIsRunning = Boolean(
    liveLastUploadRunStatus === 'queued'
    || liveLastUploadRunStatus === 'processing'
    || liveLastUpload?.files.some((file) => file.status === 'queued' || file.status === 'processing')
  )
  const selectedImportProgress = useMemo<ImportProgressSummary | null>(() => {
    if (!selectedImportData) return null
    const files = selectedImportData.files || []
    const counts = {
      imported: 0,
      duplicates: 0,
      failed: 0,
      processing: 0,
      queued: 0,
    }
    for (const file of files) {
      if (file.status === 'ok') counts.imported += 1
      else if (file.status === 'skipped_duplicate') counts.duplicates += 1
      else if (file.status === 'failed') counts.failed += 1
      else if (file.status === 'processing') counts.processing += 1
      else if (file.status === 'queued') counts.queued += 1
    }
    const total = Math.max(
      Number(selectedImportData.import.files_total || 0),
      files.length
    )
    const completedFinal = counts.imported + counts.duplicates + counts.failed
    const open = Math.max(total - completedFinal, 0)
    const progressRatio = total > 0
      ? Math.min(1, completedFinal / total)
      : (selectedImportData.import.status === 'done' ? 1 : 0)
    return {
      total,
      imported: counts.imported,
      duplicates: counts.duplicates,
      failed: counts.failed,
      processing: counts.processing,
      queued: counts.queued,
      completedFinal,
      open,
      progressRatio,
    }
  }, [selectedImportData])

  const liveLastUploadProgress = useMemo<ImportProgressSummary | null>(() => {
    if (!liveLastUpload) return null
    const counts = {
      imported: 0,
      duplicates: 0,
      failed: 0,
      processing: 0,
      queued: 0,
    }
    for (const file of liveLastUpload.files) {
      if (file.status === 'done') counts.imported += 1
      else if (file.status === 'duplicate') counts.duplicates += 1
      else if (file.status === 'failed') counts.failed += 1
      else if (file.status === 'processing') counts.processing += 1
      else if (file.status === 'queued') counts.queued += 1
    }
    const total = liveLastUpload.files.length
    const completedFinal = counts.imported + counts.duplicates + counts.failed
    const open = Math.max(total - completedFinal, 0)
    const progressRatio = total > 0
      ? Math.min(1, completedFinal / total)
      : (liveLastUploadIsRunning ? 0 : 1)
    return {
      total,
      imported: counts.imported,
      duplicates: counts.duplicates,
      failed: counts.failed,
      processing: counts.processing,
      queued: counts.queued,
      completedFinal,
      open,
      progressRatio,
    }
  }, [liveLastUpload, liveLastUploadIsRunning])

  const uploadErrorMessage = (() => {
    if (!uploadMutation.isError) return null
    const { status, responseData, message } = getApiErrorInfo(uploadMutation.error)
    const responseRecord = (typeof responseData === 'object' && responseData !== null)
      ? (responseData as Record<string, unknown>)
      : null
    const responseError = typeof responseRecord?.error === 'string' ? responseRecord.error : null
    const responseMessage = typeof responseRecord?.message === 'string' ? responseRecord.message : null

    if (status === 413) {
      return `${t('import.errors.uploadFailed')} (HTTP 413: upload too large)`
    }

    if (responseMessage && responseMessage.trim()) {
      return responseMessage.trim()
    }
    if (responseError && responseError.trim()) {
      return responseError.trim()
    }
    if (typeof responseData === 'string' && responseData.trim()) {
      return responseData.trim()
    }
    if (typeof message === 'string' && message.trim()) {
      return message.trim()
    }

    return t('import.errors.uploadFailed')
  })()
  const stravaZipErrorMessage = (() => {
    if (!stravaExportZipMutation.isError) return null
    const { status, responseData, message } = getApiErrorInfo(stravaExportZipMutation.error)
    const responseRecord = (typeof responseData === 'object' && responseData !== null)
      ? (responseData as Record<string, unknown>)
      : null
    const responseError = typeof responseRecord?.error === 'string' ? responseRecord.error : null
    const responseMessage = typeof responseRecord?.message === 'string' ? responseRecord.message : null

    if (status === 413) {
      return `${t('import.errors.uploadFailed')} (HTTP 413: upload too large)`
    }
    if (status === 504) {
      return t('import.stravaExportHint.errors.completeTimeout')
    }
    if (status === 422 && responseRecord) {
      const files = Array.isArray(responseRecord.files) ? responseRecord.files : []
      const firstFailed = files.find((item) => {
        if (!item || typeof item !== 'object') return false
        const record = item as Record<string, unknown>
        return String(record.status || '') === 'failed'
      }) as Record<string, unknown> | undefined
      const failedMessage = typeof firstFailed?.message === 'string' ? firstFailed.message : null
      if (failedMessage && failedMessage.trim()) {
        return failedMessage.trim()
      }
    }
    return responseMessage || responseError || message || t('import.errors.uploadFailed')
  })()

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <FileUp className="h-5 w-5" />
            {t('import.title')}
          </CardTitle>
          <CardDescription>{t('import.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={`rounded-lg border-2 border-dashed p-6 transition-colors ${
              isDragOver ? 'border-orange-500 bg-orange-500/5' : 'border-border'
            }`}
            onDragOver={(event) => {
              event.preventDefault()
              setIsDragOver(true)
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(event) => {
              event.preventDefault()
              setIsDragOver(false)
              onFilesSelected(event.dataTransfer.files)
            }}
          >
            <div className="flex flex-col items-center gap-2 text-center">
              <UploadCloud className="h-8 w-8 text-muted-foreground" />
              <div className="font-medium">{t('import.dropzone.title')}</div>
              <div className="text-sm text-muted-foreground">{t('import.dropzone.hint')}</div>
              <input
                ref={fileInputRef}
                id="import-files"
                type="file"
                multiple
                accept=".fit,.fit.gz,.gpx,.gpx.gz,.tcx,.tcx.gz,.csv,.csv.gz,.zip"
                className="hidden"
                onClick={(event) => {
                  event.currentTarget.value = ''
                }}
                onChange={(event) => onFilesSelected(event.target.files)}
              />
              <Button variant="outline" className="mt-2" type="button" onClick={openFileDialog}>
                {t('import.dropzone.select')}
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3 text-sm">
            <div className="font-medium text-foreground">{t('import.stravaExportHint.title')}</div>
            <div className="text-muted-foreground">{t('import.stravaExportHint.body')}</div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                ref={stravaZipInputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onClick={(event) => {
                  event.currentTarget.value = ''
                }}
                onChange={(event) => {
                  const zip = event.target.files?.[0]
                  if (zip) {
                    stravaExportZipMutation.mutate(zip)
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={openStravaZipDialog}
                disabled={uploadMutation.isPending || stravaExportZipMutation.isPending}
              >
                {stravaExportZipMutation.isPending
                  ? t('import.stravaExportHint.uploadRunning')
                  : t('import.stravaExportHint.uploadAction')}
              </Button>
              <span className="text-xs text-muted-foreground">{t('import.stravaExportHint.uploadSubhint')}</span>
            </div>
            <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-border bg-background"
                checked={stravaExportIncludeMedia}
                disabled={uploadMutation.isPending || stravaExportZipMutation.isPending}
                onChange={(event) => setStravaExportIncludeMedia(event.target.checked)}
              />
              <span>{t('import.stravaExportHint.includeMedia')}</span>
            </label>
            {stravaZipUploadProgress && stravaExportZipMutation.isPending && (
              <div className="mt-3 rounded-md border border-border/60 bg-background/50 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                  <span className="font-medium truncate">{stravaZipUploadProgress.filename}</span>
                </div>
                {stravaZipUploadProgress.phase === 'uploading' ? (
                  <>
                    <div className="text-xs text-muted-foreground">
                      {stravaZipUploadProgress.bytesTotal
                        ? t('import.stravaExportHint.progress.uploadingKnown', {
                          percent: stravaZipUploadProgress.percent ?? 0,
                          sent: formatBytes(stravaZipUploadProgress.bytesSent),
                          total: formatBytes(stravaZipUploadProgress.bytesTotal),
                        })
                        : t('import.stravaExportHint.progress.uploadingUnknown', {
                          sent: formatBytes(stravaZipUploadProgress.bytesSent),
                        })}
                    </div>
                    {Number(stravaZipUploadProgress.resumedFromBytes || 0) > 0 && (
                      <div className="text-xs text-orange-500/90">
                        {t('import.stravaExportHint.progress.resumed', {
                          sent: formatBytes(Number(stravaZipUploadProgress.resumedFromBytes || 0)),
                        })}
                      </div>
                    )}
                    <div className="h-2 w-full rounded bg-muted overflow-hidden">
                      <div
                        className="h-full bg-orange-500 transition-all"
                        style={{ width: `${stravaZipUploadProgress.percent ?? 0}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    {t('import.stravaExportHint.progress.processing')}
                  </div>
                )}
              </div>
            )}
            {stravaZipErrorMessage && (
              <div className="mt-2 text-xs text-red-500">{stravaZipErrorMessage}</div>
            )}
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">
                {t('import.selected', { count: totals.files, size: formatBytes(totals.bytes) })}
              </div>
              <div className="max-h-40 overflow-auto rounded border">
                {files.map((file) => (
                  <div key={`${file.name}-${file.size}`} className="flex items-center justify-between px-3 py-2 text-sm border-b last:border-b-0">
                    <span className="truncate pr-3">{file.name}</span>
                    <span className="text-muted-foreground">{formatBytes(file.size)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant={files.length ? 'default' : 'outline'}
              className={files.length
                ? 'bg-orange-500 text-white border border-orange-400 shadow-sm shadow-orange-500/25 hover:bg-orange-500/90'
                : ''}
              onClick={() => uploadMutation.mutate(files)}
              disabled={!files.length || uploadMutation.isPending || stravaExportZipMutation.isPending}
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('import.actions.uploading')}
                </>
              ) : (
                <>
                  <FileUp className="h-4 w-4 mr-2" />
                  {t('import.actions.upload')}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => setFiles([])}
              disabled={!files.length || uploadMutation.isPending || stravaExportZipMutation.isPending}
            >
              {t('import.actions.clear')}
            </Button>
          </div>

          {uploadMutation.isError && (
            <div className="text-sm text-red-500 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {uploadErrorMessage}
            </div>
          )}
        </CardContent>
      </Card>

      {isSimpleMode && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('import.advanced.title')}</CardTitle>
            <CardDescription>{t('import.advanced.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setShowAdvanced((prev) => !prev)}>
              {advancedVisible ? t('import.advanced.hide') : t('import.advanced.show')}
            </Button>
            <Link to="/settings?tab=import" className="text-sm text-primary hover:underline">
              {t('import.advanced.openSettings')}
            </Link>
          </CardContent>
        </Card>
      )}

      {advancedVisible && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('import.metrics.title')}</CardTitle>
              <CardDescription>{t('import.metrics.subtitle', { days: metricsData?.windowDays || metricsWindowDays })}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isMetricsLoading && <div className="text-sm text-muted-foreground">{t('common.loading')}</div>}
              {metricsData && (
                <>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                    <div>{t('import.metrics.runs')}: {metricsData.runs}</div>
                    <div>{t('import.metrics.files')}: {metricsData.filesTotal}</div>
                    <div>{t('import.metrics.successRate')}: {formatPercent(metricsData.successRate)}</div>
                    <div>{t('import.metrics.failureRate')}: {formatPercent(metricsData.failureRate)}</div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs text-muted-foreground">
                    <div>{t('import.metrics.runsDone')}: {metricsData.runsDone}</div>
                    <div>{t('import.metrics.runsPartial')}: {metricsData.runsPartial}</div>
                    <div>{t('import.metrics.runsError')}: {metricsData.runsError}</div>
                    <div>{t('import.metrics.avgFilesPerRun')}: {metricsData.avgFilesPerRun.toFixed(1)}</div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('import.queue.title')}</CardTitle>
              <CardDescription>{t('import.queue.subtitle')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isQueueStatusLoading && <div className="text-sm text-muted-foreground">{t('common.loading')}</div>}
              {queueStatusData && (
                <>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                    <div>{t('import.queue.queued')}: {queueStatusData.queued}</div>
                    <div>{t('import.queue.ready')}: {queueStatusData.ready}</div>
                    <div>{t('import.queue.processing')}: {queueStatusData.processing}</div>
                    <div>{t('import.queue.doneLastHour')}: {queueStatusData.doneLastHour}</div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs text-muted-foreground">
                    <div>{t('import.queue.failed')}: {queueStatusData.failed}</div>
                    <div>{t('import.queue.failedLast24h')}: {queueStatusData.failedLast24h}</div>
                    <div>{t('import.queue.nextAvailableAt')}: {formatDateTime(queueStatusData.nextAvailableAt)}</div>
                    <div>{t('import.queue.worker')}: {queueStatusData.worker?.running ? t('import.queue.workerRunning') : t('import.queue.workerStopped')}</div>
                  </div>
                  {queueStatusData.monitor && (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs text-muted-foreground">
                      <div>{t('import.queue.monitor')}: {queueStatusData.monitor.running ? t('import.queue.monitorRunning') : t('import.queue.monitorStopped')}</div>
                      <div>{t('import.queue.webhook')}: {queueStatusData.monitor.webhookConfigured ? t('import.queue.configured') : t('import.queue.notConfigured')}</div>
                      <div>{t('import.queue.alertsSent')}: {queueStatusData.monitor.sentCount}</div>
                      <div>{t('import.queue.alertsFailed')}: {queueStatusData.monitor.failedCount}</div>
                    </div>
                  )}
                  {queueStatusData.worker?.lastError && (
                    <div className="text-xs text-red-500">{queueStatusData.worker.lastError}</div>
                  )}
                  {queueStatusData.monitor?.lastError && (
                    <div className="text-xs text-red-500">{queueStatusData.monitor.lastError}</div>
                  )}
                  {!!queueStatusData.alerts?.length && (
                    <div className="space-y-2">
                      {queueStatusData.alerts.map((alert) => (
                        <div key={alert.code} className={`rounded border px-3 py-2 text-xs ${alert.severity === 'critical' ? 'border-red-300 text-red-600' : 'border-yellow-300 text-yellow-700'}`}>
                          <div className="font-medium">{alert.code}</div>
                          <div>{alert.message}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-lg">{t('import.queueFailed.title')}</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!failedQueueJobsData?.jobs?.length || deleteVisibleQueueJobsMutation.isPending || requeueVisibleQueueJobsMutation.isPending}
                    onClick={() => deleteVisibleQueueJobsMutation.mutate()}
                  >
                    {deleteVisibleQueueJobsMutation.isPending
                      ? t('import.queueFailed.deleteVisibleRunning')
                      : t('import.queueFailed.deleteVisible', { count: failedQueueJobsData?.jobs?.length || 0 })}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!failedQueueJobsData?.jobs?.length || requeueVisibleQueueJobsMutation.isPending || deleteVisibleQueueJobsMutation.isPending}
                    onClick={() => requeueVisibleQueueJobsMutation.mutate()}
                  >
                    {requeueVisibleQueueJobsMutation.isPending
                      ? t('import.queueFailed.requeueVisibleRunning')
                      : t('import.queueFailed.requeueVisible', { count: failedQueueJobsData?.jobs?.length || 0 })}
                  </Button>
                </div>
              </div>
              <CardDescription>{t('import.queueFailed.subtitle')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isFailedQueueJobsLoading && <div className="text-sm text-muted-foreground">{t('common.loading')}</div>}
              {failedQueueJobsData && (
                <div className="space-y-2 max-h-80 overflow-auto">
                  {failedQueueJobsData.jobs.map((job) => (
                    <div key={job.id} className="rounded border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium">#{job.id} · {job.original_filename}</div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={deleteQueueJobMutation.isPending || requeueQueueJobMutation.isPending}
                            onClick={() => deleteQueueJobMutation.mutate(job.id)}
                          >
                            {t('import.queueFailed.delete')}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={requeueQueueJobMutation.isPending || deleteQueueJobMutation.isPending}
                            onClick={() => requeueQueueJobMutation.mutate(job.id)}
                          >
                            {t('import.queueFailed.requeue')}
                          </Button>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t('import.queueFailed.attempts', { current: job.attempt_count, max: job.max_attempts })}
                      </div>
                      {job.last_error && (
                        <div className="text-xs text-red-500">{job.last_error}</div>
                      )}
                    </div>
                  ))}
                  {!failedQueueJobsData.jobs.length && (
                    <div className="text-sm text-muted-foreground">{t('import.queueFailed.empty')}</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('import.watch.title')}</CardTitle>
              <CardDescription>{t('import.watch.subtitle')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isWatchLoading && <div className="text-sm text-muted-foreground">{t('common.loading')}</div>}
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
                <div className="text-sm font-semibold">{t('import.watch.config.title')}</div>
                <p className="text-xs text-muted-foreground">{t('import.watch.config.hint')}</p>
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">{t('import.watch.config.networkPath')}</div>
                    <div className="rounded-md border border-border bg-background px-2 py-2 text-sm font-mono break-all">
                      {watchStatus?.sharePathHint || t('import.watch.config.networkPathMissing')}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">{t('import.watch.config.path')}</div>
                    <div className="rounded-md border border-border bg-background px-2 py-2 text-sm font-mono break-all">
                      {watchStatus?.path || '—'}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">{t('import.watch.config.copyHint')}</div>
              </div>
              {watchStatus && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    {watchStatus.enabled
                      ? statusBadge(watchStatus.running ? 'processing' : 'failed')
                      : statusBadge('failed')}
                    <span className="text-sm text-muted-foreground">
                      {watchStatus.enabled
                        ? (watchStatus.running ? t('import.watch.running') : t('import.watch.enabledNotRunning'))
                        : t('import.watch.disabled')}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {t('import.watch.path')}: <span className="font-mono">{watchStatus.path || '—'}</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                    <div>{t('import.watch.stats.imported')}: {watchStatus.stats.importedFiles}</div>
                    <div>{t('import.watch.stats.duplicates')}: {watchStatus.stats.duplicates}</div>
                    <div>{t('import.watch.stats.failed')}: {watchStatus.stats.failed}</div>
                    <div>{t('import.watch.stats.scans')}: {watchStatus.stats.scans}</div>
                  </div>
                  {watchStatus.stats.lastError && (
                    <div className="text-xs text-red-500">{watchStatus.stats.lastError}</div>
                  )}
                </>
              )}
              <Button onClick={() => rescanMutation.mutate()} disabled={rescanMutation.isPending}>
                {rescanMutation.isPending ? t('import.watch.rescanRunning') : t('import.watch.rescan')}
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {liveLastUpload && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              {t('import.lastResult')}
              {liveLastUploadIsRunning && (
                <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/20">
                  {t('import.status.processing')}
                </Badge>
              )}
              {liveLastUploadRunStatus === 'done' && (
                <Badge className="bg-green-500/15 text-green-600 border-green-500/20">
                  {t('import.status.done')}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm text-muted-foreground">
              {t('import.importId', { id: liveLastUpload.importId })}
            </div>
            {liveLastUploadProgress && (
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div className="font-medium">{t('import.progressSummary.title')}</div>
                  <div className="text-muted-foreground">
                    {t('import.progressSummary.completedOfTotal', {
                      done: liveLastUploadProgress.completedFinal,
                      total: liveLastUploadProgress.total,
                    })}
                  </div>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-orange-500 transition-all"
                    style={{ width: `${Math.round(liveLastUploadProgress.progressRatio * 100)}%` }}
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs text-muted-foreground">
                  <div>{t('import.progressSummary.imported')}: {liveLastUploadProgress.imported}</div>
                  <div>{t('import.progressSummary.open')}: {liveLastUploadProgress.open}</div>
                  <div>{t('import.progressSummary.processing')}: {liveLastUploadProgress.processing}</div>
                  <div>{t('import.progressSummary.queued')}: {liveLastUploadProgress.queued}</div>
                  <div>{t('import.progressSummary.duplicates')}: {liveLastUploadProgress.duplicates}</div>
                  <div>{t('import.progressSummary.failed')}: {liveLastUploadProgress.failed}</div>
                  <div>{t('import.progressSummary.total')}: {liveLastUploadProgress.total}</div>
                  <div>{t('import.progressSummary.percent')}: {Math.round(liveLastUploadProgress.progressRatio * 100)}%</div>
                </div>
              </div>
            )}
            <div className="space-y-2">
              {liveLastUpload.files.map((file, index) => (
                <div key={`${file.filename}-${index}`} className="rounded border p-3 space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium truncate">{file.filename}</div>
                    {statusBadge(file.status)}
                  </div>
                  <div className="text-sm text-muted-foreground">{file.message}</div>
                  {file.activityId ? (
                    <Link className="text-sm text-orange-500 hover:underline" to={`/activity/${file.activityId}`}>
                      {t('import.viewActivity')}
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!isSimpleMode && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileArchive className="h-5 w-5" />
                {t('import.logs.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isRunsLoading ? (
                <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
              ) : (
                <div className="space-y-2">
                  {recentRuns.map((run) => (
                    <button
                      key={run.id}
                      className={`w-full rounded border p-3 text-left transition-colors ${selectedImportId === run.id ? 'border-orange-500 bg-orange-500/5' : 'hover:bg-muted/30'}`}
                      onClick={() => setSelectedImportId(run.id)}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium">#{run.id}</div>
                        {statusBadge(run.status)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {formatDateTime(run.started_at)} · {run.files_ok}/{run.files_total} OK
                      </div>
                    </button>
                  ))}
                  {!recentRuns.length && (
                    <div className="text-sm text-muted-foreground">{t('import.logs.empty')}</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-lg">{t('import.logs.detailTitle')}</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!selectedImportId || selectedFailedCount === 0 || retryFailedMutation.isPending}
                  onClick={() => selectedImportId && retryFailedMutation.mutate(selectedImportId)}
                >
                  {retryFailedMutation.isPending ? t('import.retry.running') : t('import.retry.button', { count: selectedFailedCount })}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!selectedImportId && <div className="text-sm text-muted-foreground">{t('import.logs.selectHint')}</div>}
              {selectedImportId && isImportDetailLoading && (
                <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
              )}
              {selectedImportData && (
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    {t('import.importId', { id: selectedImportData.import.id })} · {formatDateTime(selectedImportData.import.started_at)}
                  </div>
                  {selectedImportProgress && (
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <div className="font-medium">{t('import.progressSummary.title')}</div>
                        <div className="text-muted-foreground">
                          {t('import.progressSummary.completedOfTotal', {
                            done: selectedImportProgress.completedFinal,
                            total: selectedImportProgress.total,
                          })}
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-orange-500 transition-all"
                          style={{ width: `${Math.round(selectedImportProgress.progressRatio * 100)}%` }}
                        />
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 text-xs text-muted-foreground">
                        <div>{t('import.progressSummary.imported')}: {selectedImportProgress.imported}</div>
                        <div>{t('import.progressSummary.open')}: {selectedImportProgress.open}</div>
                        <div>{t('import.progressSummary.processing')}: {selectedImportProgress.processing}</div>
                        <div>{t('import.progressSummary.queued')}: {selectedImportProgress.queued}</div>
                        <div>{t('import.progressSummary.duplicates')}: {selectedImportProgress.duplicates}</div>
                        <div>{t('import.progressSummary.failed')}: {selectedImportProgress.failed}</div>
                      </div>
                    </div>
                  )}
                  {selectedFailedCount > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {t('import.retry.hint', { count: selectedFailedCount })}
                    </div>
                  )}
                  <div className="space-y-2 max-h-80 overflow-auto">
                    {selectedImportData.files.map((file) => (
                      <div key={file.id} className="rounded border p-3 space-y-1">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium truncate">{file.original_filename}</div>
                          {statusBadge(file.status)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {(file.detected_format || 'unknown').toUpperCase()} · {file.size_bytes ? formatBytes(file.size_bytes) : '—'}
                        </div>
                        {file.error_message && (
                          <div className="text-xs text-red-500">{file.error_message}</div>
                        )}
                        {file.activity_id ? (
                          <Link className="text-sm text-orange-500 hover:underline" to={`/activity/${file.activity_id}`}>
                            {t('import.viewActivity')}
                          </Link>
                        ) : null}
                      </div>
                    ))}
                    {!selectedImportData.files.length && (
                      <div className="text-sm text-muted-foreground">{t('import.logs.noFiles')}</div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
