import DynamicIslandTodo from "@/components/DynamicIslandTodo"

export default function Home() {
  return (
    <main
      className="flex min-h-screen items-center justify-center p-4"
      style={{
        backgroundImage:
          'url("https://hebbkx1anhila5yf.public.blob.vercel-storage.com/11-CZKf7nC98t9BHERi9Ux0qB6xFiinSA.png")',
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <DynamicIslandTodo />
    </main>
  )
}
