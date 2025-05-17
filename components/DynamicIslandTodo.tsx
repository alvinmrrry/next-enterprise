"use client"

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Pencil, Plus, X, Check, RotateCcw, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/components/ui/use-toast"

// Operation state interface
interface OperationState {
  adding: boolean
  toggling: Record<number, boolean>
  removing: Record<number, boolean>
}

interface Todo {
  id: number
  text: string
  completed: boolean
}

const snappyTransition = {
  type: "spring",
  stiffness: 500,
  damping: 30,
  mass: 1,
}

// Updated DynamicIslandTodo component with optimistic updates and more granular loading states
export default function DynamicIslandTodo() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [newTodo, setNewTodo] = useState("")
  const [isExpanded, setIsExpanded] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [opState, setOpState] = useState<OperationState>({
    adding: false,
    toggling: {},
    removing: {},
  })
  const inputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  // Fetch todos function
  useEffect(() => {
    const fetchTodos = async () => {
      try {
        setIsLoading(true)
        const { data, error } = await supabase.from("todos").select("*").order("id", { ascending: true })

        if (error) {
          console.error("Error fetching todos:", error)
          toast({
            title: "Failed to load",
            description: "Could not load your todos. Please try again later.",
            variant: "destructive",
          })
          return
        }

        setTodos(data || [])
      } catch (error) {
        console.error("Error fetching todos:", error)
        toast({
          title: "Failed to load",
          description: "Could not load your todos. Please try again later.",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchTodos()

    // Set up realtime subscription
    const subscription = supabase
      .channel("todos-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "todos" }, (payload) => {
        if (payload.eventType === "INSERT") {
          setTodos((prev) => [...prev, payload.new as Todo])
        } else if (payload.eventType === "UPDATE") {
          setTodos((prev) => prev.map((todo) => (todo.id === payload.new.id ? (payload.new as Todo) : todo)))
        } else if (payload.eventType === "DELETE") {
          setTodos((prev) => prev.filter((todo) => todo.id !== payload.old.id))
        }
      })
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [toast])

  // Optimized add todo function with optimistic updates
  const addTodo = useCallback(async () => {
    if (newTodo.trim() === "") return

    try {
      setOpState((prev) => ({ ...prev, adding: true }))

      // Create temporary ID for optimistic update
      // Use a negative ID to avoid conflict with Supabase auto-incrementing IDs
      const tempId = -Date.now()
      const tempTodo = { id: tempId, text: newTodo, completed: false }

      // Optimistically update UI
      setTodos((prev) => [...prev, tempTodo])
      setNewTodo("")

      // Actually send to server
      const { data, error } = await supabase
        .from("todos")
        .insert([{ text: newTodo, completed: false }])
        .select()

      if (error) {
        // If error, rollback optimistic update
        setTodos((prev) => prev.filter((todo) => todo.id !== tempId))
        setNewTodo(newTodo)
        toast({
          title: "Failed to add",
          description: "Could not add new todo. Please try again later.",
          variant: "destructive",
        })
        console.error("Error adding todo:", JSON.stringify(error))
      } else if (data && data.length > 0) {
        // Replace temporary todo with the actual one from the server
        setTodos((prev) => prev.map((todo) => (todo.id === tempId ? data[0] : todo)))
      }
    } catch (error) {
      console.error("Error adding todo:", JSON.stringify(error))
      toast({
        title: "Failed to add",
        description: "Could not add new todo. Please try again later.",
        variant: "destructive",
      })
    } finally {
      setOpState((prev) => ({ ...prev, adding: false }))
    }
  }, [newTodo, toast]) // Added newTodo and toast to dependencies

  // Optimized toggle todo function with optimistic updates
  const toggleTodo = useCallback(async (id: number, completed: boolean) => {
    try {
      // Set specific todo's toggling state
      setOpState((prev) => ({
        ...prev,
        toggling: { ...prev.toggling, [id]: true },
      }))

      // Optimistically update UI
      setTodos((prev) => prev.map((todo) => (todo.id === id ? { ...todo, completed: !completed } : todo)))

      // Actually send to server
      const { error } = await supabase.from("todos").update({ completed: !completed }).eq("id", id)

      if (error) {
        // If error, rollback optimistic update
        setTodos((prev) => prev.map((todo) => (todo.id === id ? { ...todo, completed: completed } : todo)))
        toast({
          title: "Failed to update",
          description: "Could not update todo status. Please try again later.",
          variant: "destructive",
        })
        console.error("Error toggling todo:", JSON.stringify(error))
      }
    } catch (error) {
      console.error("Error toggling todo:", JSON.stringify(error))
      toast({
        title: "Failed to update",
        description: "Could not update todo status. Please try again later.",
        variant: "destructive",
      })
    } finally {
      setOpState((prev) => ({
        ...prev,
        toggling: { ...prev.toggling, [id]: false },
      }))
    }
  }, [toast]) // Added toast to dependencies

  // Optimized remove todo function with optimistic updates
  const removeTodo = useCallback(async (id: number) => {
    try {
      // Set specific todo's removing state
      setOpState((prev) => ({
        ...prev,
        removing: { ...prev.removing, [id]: true },
      }))

      // Save current todo for possible rollback
      const todoToRemove = todos.find((todo) => todo.id === id)

      // Optimistically update UI
      setTodos((prev) => prev.filter((todo) => todo.id !== id))

      // Actually send to server
      const { error } = await supabase.from("todos").delete().eq("id", id)

      if (error) {
        // If error, rollback optimistic update
        if (todoToRemove) {
          setTodos((prev) => [...prev, todoToRemove])
        }
        toast({
          title: "Failed to delete",
          description: "Could not delete todo. Please try again later.",
          variant: "destructive",
        })
        console.error("Error removing todo:", JSON.stringify(error))
      }
    } catch (error) {
      console.error("Error removing todo:", JSON.stringify(error))
      toast({
        title: "Failed to delete",
        description: "Could not delete todo. Please try again later.",
        variant: "destructive",
      })
    } finally {
      setOpState((prev) => ({
        ...prev,
        removing: { ...prev.removing, [id]: false },
      }))
    }
  }, [todos, toast]) // Added todos and toast to dependencies

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      addTodo()
    }
  }, [addTodo]) // Added addTodo to dependencies

  const sortedTodos = React.useMemo(() => {
    return [...todos].sort((a, b) => {
      if (a.completed === b.completed) return 0
      return a.completed ? 1 : -1
    })
  }, [todos])

  const completedTodos = React.useMemo(() => todos.filter((todo) => todo.completed).length, [todos])
  const remainingTodos = React.useMemo(() => todos.length - completedTodos, [todos, completedTodos])


  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isExpanded && !(event.target as Element).closest(".dynamic-island-todo")) {
        setIsExpanded(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isExpanded])

  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isExpanded])

  return (
    <motion.div
      className="fixed left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 dynamic-island-todo"
      initial={false}
      animate={{
        width: isExpanded ? "var(--di-expanded-width)" : "var(--di-collapsed-width)",
        height: isExpanded ? "auto" : "var(--di-collapsed-height)",
        borderRadius: isExpanded ? "var(--di-expanded-radius)" : "var(--di-border-radius)",
      }}
      transition={{
        ...snappyTransition,
        borderRadius: { duration: 0.08 },
      }}
    >
      <motion.div
        className="bg-black text-white h-full cursor-pointer overflow-hidden rounded-[inherit] border border-gray-800"
        onClick={() => !isExpanded && setIsExpanded(true)}
        layout
        transition={snappyTransition}
      >
        {!isExpanded && (
          <motion.div className="p-2 flex items-center justify-between h-full" layout>
            <span className="font-semibold">To-do List</span>
            <div className="flex items-center space-x-2 h-full">
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              ) : (
                <>
                  {remainingTodos > 0 && (
                    <span className="bg-yellow-500 text-black rounded-full w-6 h-6 min-w-[24px] flex items-center justify-center text-xs font-medium">
                      {remainingTodos}
                    </span>
                  )}
                  {completedTodos > 0 && (
                    <span className="bg-gray-500 text-white rounded-full w-6 h-6 min-w-[24px] flex items-center justify-center text-xs font-medium">
                      {completedTodos}
                    </span>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{
                ...snappyTransition,
                opacity: { duration: 0.1 },
              }}
              className="p-4 pb-2"
            >
              <div className="flex mb-4 items-center">
                <div className="flex-grow relative mr-2">
                  <Input
                    type="text"
                    value={newTodo}
                    onChange={(e) => setNewTodo(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Add a new todo..."
                    className="w-full bg-[#111111] border-[#222222] text-gray-200 placeholder:text-gray-500 focus:border-[#333333] focus:outline-none focus:ring-0 focus:ring-offset-0 h-10 pl-10 transition-colors duration-200 rounded-lg"
                    ref={inputRef}
                    aria-label="New todo input"
                    disabled={opState.adding}
                  />
                  <Pencil className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                </div>
                <Button
                  onClick={addTodo}
                  className="bg-[#111111] hover:bg-[#222222] text-gray-400 hover:text-gray-200 transition-colors h-10 px-3 border border-[#222222] rounded-lg"
                  disabled={opState.adding || newTodo.trim() === ""}
                >
                  {opState.adding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                </Button>
              </div>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : (
                <motion.ul className="space-y-2 max-h-60 overflow-y-auto" role="list" aria-label="Todo list" layout>
                  <AnimatePresence initial={false}>
                    {sortedTodos.length === 0 ? (
                      <motion.li
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-center py-4 text-gray-500 text-sm"
                      >
                        No todos yet
                      </motion.li>
                    ) : (
                      sortedTodos.map((todo) => (
                        <motion.li
                          key={todo.id}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={snappyTransition}
                          className="flex items-center justify-between"
                          role="listitem"
                          layout
                        >
                          <span
                            className={`flex-grow text-sm ${
                              todo.completed ? "text-gray-500 line-through decoration-gray-500" : "text-yellow-500"
                            } ${opState.toggling[todo.id] ? "opacity-50" : ""}`}
                            onClick={() => !opState.toggling[todo.id] && toggleTodo(todo.id, todo.completed)}
                            style={{ cursor: opState.toggling[todo.id] ? "wait" : "pointer" }}
                          >
                            {todo.text}
                          </span>
                          <div className="flex items-center bg-[#111111] rounded-md border border-[#222222]">
                            <Button
                              onClick={() => !opState.toggling[todo.id] && toggleTodo(todo.id, todo.completed)}
                              size="sm"
                              variant="ghost"
                              className="h-10 px-3 text-gray-400 hover:text-gray-200 hover:bg-[#222222] rounded-none"
                              aria-label={`${todo.completed ? "Revert" : "Complete"} "${todo.text}"`}
                              disabled={opState.toggling[todo.id]}
                            >
                              {opState.toggling[todo.id] ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : todo.completed ? (
                                <RotateCcw size={14} />
                              ) : (
                                <Check size={14} />
                              )}
                            </Button>
                            <Separator orientation="vertical" className="h-5 bg-[#222222]" />
                            <Button
                              onClick={() => !opState.removing[todo.id] && removeTodo(todo.id)}
                              size="sm"
                              variant="ghost"
                              className="h-10 px-3 text-gray-400 hover:text-gray-200 hover:bg-[#222222] rounded-none"
                              aria-label={`Remove "${todo.text}" from the list`}
                              disabled={opState.removing[todo.id]}
                            >
                              {opState.removing[todo.id] ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <X size={14} />
                              )}
                            </Button>
                          </div>
                        </motion.li>
                      ))
                    )}
                  </AnimatePresence>
                </motion.ul>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}
