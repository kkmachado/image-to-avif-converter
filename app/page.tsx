import { ImageConverter } from "@/components/image-converter"

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-4">Conversor de Imagens AVIF</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Converta suas imagens para o formato AVIF de alta qualidade e menor tamanho. Arraste e solte suas imagens ou
            clique para selecionar.
          </p>
        </div>
        <ImageConverter />
      </div>
    </main>
  )
}
