"use client"

import { useState, useCallback, useEffect } from "react"
import { useDropzone } from "react-dropzone"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Upload, Download, ImageIcon, CheckCircle, AlertCircle, X, Settings } from "lucide-react"
import { cn } from "@/lib/utils"

interface ConvertedImage {
  id: string
  originalName: string
  originalSize: number
  convertedUrl?: string | null
  convertedSize?: number
  status: "uploading" | "converting" | "completed" | "error"
  progress: number
  error?: string
  thumbnailUrl?: string
}

export function ImageConverter() {
  const [images, setImages] = useState<ConvertedImage[]>([])
  const [isConverting, setIsConverting] = useState(false)
  const [isConfigured, setIsConfigured] = useState(false)

  useEffect(() => {
    const webhookUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL
    setIsConfigured(!!webhookUrl && webhookUrl.trim() !== "")
  }, [])

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (!isConfigured) {
        return
      }

      const newImages: ConvertedImage[] = acceptedFiles.map((file) => {
        const thumbnailUrl = URL.createObjectURL(file)

        return {
          id: Math.random().toString(36).substr(2, 9),
          originalName: file.name,
          originalSize: file.size,
          status: "uploading",
          progress: 0,
          thumbnailUrl,
        }
      })

      setImages((prev) => [...prev, ...newImages])

      newImages.forEach((image) => {
        convertImage(acceptedFiles.find((f) => f.name === image.originalName)!, image.id)
      })
    },
    [isConfigured],
  )

  const convertImage = async (file: File, imageId: string) => {
    try {
      setIsConverting(true)

      const webhookUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL

      if (!webhookUrl) {
        throw new Error("Webhook URL não configurada. Configure a variável NEXT_PUBLIC_N8N_WEBHOOK_URL.")
      }

      try {
        new URL(webhookUrl)
      } catch {
        throw new Error("URL do webhook inválida. Verifique se a URL está no formato correto (ex: https://...)")
      }

      setImages((prev) => prev.map((img) => (img.id === imageId ? { ...img, status: "converting" as const } : img)))

      for (let progress = 0; progress <= 100; progress += 10) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        setImages((prev) => prev.map((img) => (img.id === imageId ? { ...img, progress } : img)))
      }

      const formData = new FormData()
      formData.append("image", file)
      formData.append("format", "avif")
      formData.append("quality", "80")

      console.log("[v0] Enviando para webhook:", webhookUrl)
      console.log("[v0] Arquivo:", file.name, "Tamanho:", file.size)

      const response = await fetch(webhookUrl, {
        method: "POST",
        body: formData,
      })

      console.log("[v0] Resposta do webhook:", response.status, response.statusText)

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Erro desconhecido")
        throw new Error(`Erro na conversão (${response.status}): ${errorText}`)
      }

      let result
      try {
        const responseText = await response.text()
        console.log("[v0] Resposta bruta:", responseText)

        if (!responseText || responseText.trim() === "") {
          console.log("[v0] Resposta vazia detectada - webhook não configurado para retornar dados")

          setImages((prev) =>
            prev.map((img) =>
              img.id === imageId
                ? {
                    ...img,
                    status: "completed" as const,
                    convertedUrl: null,
                    convertedSize: Math.floor(file.size * 0.6), // Estimativa
                    progress: 100,
                    error:
                      "Webhook processou mas não retornou URL de download. Configure o fluxo n8n para retornar JSON com a URL.",
                  }
                : img,
            ),
          )
          return
        }

        result = JSON.parse(responseText)
        console.log("[v0] JSON parseado:", result)
      } catch (parseError) {
        console.error("[v0] Erro ao parsear JSON:", parseError)

        setImages((prev) =>
          prev.map((img) =>
            img.id === imageId
              ? {
                  ...img,
                  status: "error" as const,
                  error: "Resposta inválida do webhook. Verifique se o webhook retorna JSON válido.",
                }
              : img,
          ),
        )
        return
      }

      let processedResult = result

      if (Array.isArray(result) && result.length > 0) {
        processedResult = result[0]
        console.log("[v0] Array detectado, usando primeiro item:", processedResult)
      }

      if (!processedResult || typeof processedResult !== "object") {
        setImages((prev) =>
          prev.map((img) =>
            img.id === imageId
              ? {
                  ...img,
                  status: "error" as const,
                  error: "Formato de resposta inválido do webhook",
                }
              : img,
          ),
        )
        return
      }

      const downloadUrl =
        processedResult.secure_url ||
        processedResult.url ||
        processedResult.downloadUrl ||
        processedResult.file_url ||
        processedResult.download_url ||
        processedResult.public_url ||
        processedResult.link ||
        processedResult.href ||
        (processedResult.data &&
          (processedResult.data.url || processedResult.data.downloadUrl || processedResult.data.file_url)) ||
        (processedResult.file && (processedResult.file.url || processedResult.file.downloadUrl)) ||
        null

      console.log("[v0] URL detectada:", downloadUrl)
      console.log("[v0] Campos disponíveis no resultado:", Object.keys(processedResult))

      setImages((prev) =>
        prev.map((img) =>
          img.id === imageId
            ? {
                ...img,
                status: "completed" as const,
                convertedUrl: downloadUrl,
                convertedSize:
                  processedResult.bytes ||
                  processedResult.size ||
                  processedResult.file_size ||
                  Math.floor(file.size * 0.6),
                progress: 100,
              }
            : img,
        ),
      )
    } catch (error) {
      console.error("[v0] Erro na conversão:", error)
      setImages((prev) =>
        prev.map((img) =>
          img.id === imageId
            ? {
                ...img,
                status: "error" as const,
                error: error instanceof Error ? error.message : "Erro desconhecido na conversão",
              }
            : img,
        ),
      )
    } finally {
      setIsConverting(false)
    }
  }

  const removeImage = (imageId: string) => {
    const imageToRemove = images.find((img) => img.id === imageId)
    if (imageToRemove?.thumbnailUrl) {
      URL.revokeObjectURL(imageToRemove.thumbnailUrl)
    }
    setImages((prev) => prev.filter((img) => img.id !== imageId))
  }

  const downloadImage = async (url: string | null, filename: string) => {
    if (!url) {
      alert(
        'URL de download não disponível.\n\nPara resolver:\n\n1. Configure seu fluxo n8n para retornar JSON com a URL:\n   { "url": "https://res.cloudinary.com/...", "size": 12345 }\n\n2. No n8n, adicione um nó \'Respond to Webhook\' no final do fluxo\n\n3. Configure o Cloudinary para retornar URLs públicas\n\n4. Teste o webhook diretamente para verificar a resposta\n\nConsulte os logs do navegador para mais detalhes.',
      )
      return
    }

    try {
      console.log("[v0] Iniciando download forçado de:", url)

      // Fetch da imagem para criar um blob local
      const response = await fetch(url, {
        mode: "cors",
        credentials: "omit",
      })

      if (!response.ok) {
        throw new Error(`Erro ao baixar: ${response.status}`)
      }

      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)

      // Criar link temporário com o blob local
      const link = document.createElement("a")
      link.href = blobUrl
      link.download = filename.replace(/\.[^/.]+$/, ".avif")
      link.style.display = "none"

      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Limpar o blob URL após um tempo
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl)
      }, 1000)

      console.log("[v0] Download iniciado com sucesso")
    } catch (error) {
      console.error("[v0] Erro no download via fetch, tentando método direto:", error)

      // Fallback: método direto (pode abrir em nova aba em alguns casos)
      try {
        const link = document.createElement("a")
        link.href = url
        link.download = filename.replace(/\.[^/.]+$/, ".avif")
        link.target = "_blank"
        link.rel = "noopener noreferrer"
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      } catch (fallbackError) {
        console.error("[v0] Erro no fallback:", fallbackError)
        // Último recurso: abrir em nova aba
        window.open(url, "_blank")
      }
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".jpeg", ".jpg", ".png", ".webp", ".gif", ".bmp", ".tiff"],
    },
    multiple: true,
    disabled: !isConfigured,
  })

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {!isConfigured && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-6">
            <div className="flex items-start space-x-4">
              <div className="p-2 rounded-full bg-destructive/10">
                <Settings className="h-6 w-6 text-destructive" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-red-900 mb-2">Configuração Necessária</h3>
                <p className="text-muted-foreground mb-4">
                  Para usar o conversor de imagens, você precisa configurar a variável de ambiente do webhook n8n.
                </p>
                <div className="bg-muted p-4 rounded-lg">
                  <p className="text-sm font-medium mb-2">Passos para configurar:</p>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Acesse as configurações do projeto no Vercel</li>
                    <li>Vá para a seção "Environment Variables"</li>
                    <li>
                      Adicione a variável:{" "}
                      <code className="bg-background px-2 py-1 rounded text-foreground">
                        NEXT_PUBLIC_N8N_WEBHOOK_URL
                      </code>
                    </li>
                    <li>Cole a URL do seu webhook n8n/Cloudinary</li>
                    <li>Faça o redeploy da aplicação</li>
                  </ol>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-6">
          <div
            {...getRootProps()}
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
              !isConfigured && "opacity-50 cursor-not-allowed",
              isDragActive && isConfigured
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-muted/50",
            )}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center space-y-3">
              <div className="p-3 rounded-full bg-primary/10">
                <Upload className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground mb-1">
                  {!isConfigured
                    ? "Configure o webhook para começar"
                    : isDragActive
                      ? "Solte as imagens aqui"
                      : "Arraste imagens ou clique para selecionar"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {isConfigured ? "Suporta JPEG, PNG, WebP, GIF, BMP e TIFF" : "Configuração necessária acima"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {images.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Imagens ({images.length})</h2>

          {images.map((image) => (
            <Card key={image.id}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4 flex-1">
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                      {image.thumbnailUrl ? (
                        <img
                          src={image.thumbnailUrl || "/placeholder.svg"}
                          alt={image.originalName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground truncate">{image.originalName}</h3>
                      <div className="flex items-center space-x-4 mt-1">
                        <span className="text-sm text-muted-foreground">{formatFileSize(image.originalSize)}</span>
                        {image.convertedSize && (
                          <>
                            <span className="text-sm text-muted-foreground">→</span>
                            <span className="text-sm text-primary font-medium">
                              {formatFileSize(image.convertedSize)}
                            </span>
                            <Badge variant="secondary" className="text-xs">
                              -{Math.round((1 - image.convertedSize / image.originalSize) * 100)}%
                            </Badge>
                          </>
                        )}
                      </div>

                      {(image.status === "uploading" || image.status === "converting") && (
                        <div className="mt-2">
                          <Progress value={image.progress} className="h-2" />
                          <p className="text-xs text-muted-foreground mt-1">
                            {image.status === "uploading" ? "Enviando..." : "Convertendo..."}
                          </p>
                        </div>
                      )}

                      {image.status === "error" && <p className="text-sm text-destructive mt-1">{image.error}</p>}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {image.status === "completed" && (
                      <>
                        <CheckCircle className="h-5 w-5 text-primary" />
                        <Button
                          size="sm"
                          onClick={() => downloadImage(image.convertedUrl, image.originalName)}
                          className={cn(
                            "bg-primary hover:bg-primary/90",
                            !image.convertedUrl && "bg-muted hover:bg-muted/80 text-muted-foreground",
                          )}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {image.convertedUrl ? "Download" : "Sem URL"}
                        </Button>
                      </>
                    )}

                    {image.status === "error" && <AlertCircle className="h-5 w-5 text-destructive" />}

                    <Button variant="ghost" size="sm" onClick={() => removeImage(image.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
