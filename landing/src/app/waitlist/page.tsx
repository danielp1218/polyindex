'use client'

import { useState } from 'react'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabase'
import { Spotlight } from '@/components/ui/Spotlight'
import { motion } from 'framer-motion'
import { Sidebar } from '@/components/Sidebar'
import { BalanceCard } from '@/components/BalanceCard'
import { BetsList } from '@/components/BetsList'
import { IndexTable } from '@/components/IndexTable'

export default function WaitlistPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email) {
      setStatus('error')
      setMessage('Please enter your email.')
      return
    }
    
    if (!validateEmail(email)) {
      setStatus('error')
      setMessage('Please enter a valid email address.')
      return
    }
    
    setStatus('loading')

    const { error } = await getSupabase().from('waitlist').insert({ email })

    if (error) {
      if (error.code === '23505') {
        setStatus('error')
        setMessage('This email is already on the waitlist.')
      } else {
        setStatus('error')
        setMessage('Something went wrong. Please try again.')
      }
      return
    }

    setStatus('success')
    setMessage("You're on the list! We'll be in touch soon.")
    setEmail('')
  }

  return (
    <div className="h-screen bg-[#0d1926] overflow-hidden relative">
      <div
        className="absolute inset-0 pointer-events-none z-[41]"
        style={{
          backdropFilter: 'blur(1px)',
          WebkitBackdropFilter: 'blur(1px)',
          maskImage: `linear-gradient(
            45deg,
            black 0%,
            black 40%,
            transparent 48%,
            transparent 56%,
            black 64%,
            black 100%
          )`,
          WebkitMaskImage: `linear-gradient(
            45deg,
            black 0%,
            black 40%,
            transparent 48%,
            transparent 56%,
            black 64%,
            black 100%
          )`
        }}
      />

      <div
        className="absolute inset-0 pointer-events-none z-[40]"
        style={{
          background: `linear-gradient(
            45deg,
            rgba(8, 18, 32, 0.3) 0%,
            rgba(8, 18, 32, 0.2) 40%,
            transparent 48%,
            transparent 56%,
            rgba(8, 18, 32, 0.2) 64%,
            rgba(8, 18, 32, 0.4) 80%,
            rgba(8, 18, 32, 0.55) 100%
          )`
        }}
      />

      <div
        className="absolute inset-0 pointer-events-none z-[39]"
        style={{
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
          maskImage: `radial-gradient(ellipse 60% 50% at 20% 80%, black 0%, transparent 70%)`,
          WebkitMaskImage: `radial-gradient(ellipse 60% 50% at 20% 80%, black 0%, transparent 70%)`
        }}
      />

      <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-transparent border-b border-white/5">
        <div className="max-w-[1400px] mx-auto h-full px-4 md:px-8 flex items-center justify-between">
          <Link href="/" className="text-white font-serif text-xl md:text-2xl font-extrabold italic tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
            Pindex
          </Link>
        </div>
      </header>

      <main className="pt-14 h-screen relative overflow-hidden blur-md">
        <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-4 h-[calc(100vh-56px)] flex flex-col overflow-hidden">
          <div className="flex flex-col md:flex-row gap-4 md:gap-6 flex-1 min-h-0 overflow-hidden">
            <div className="hidden md:block border-r border-white/10">
              <Sidebar />
            </div>

            <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-hidden">
              <div className="flex flex-col md:flex-row gap-4 items-stretch flex-1 min-h-0">
                <div className="flex-[3] min-w-0">
                  <BalanceCard />
                </div>
                <div className="flex-[2] min-w-0">
                  <BetsList />
                </div>
              </div>

              <div className="relative flex-1 min-h-0 overflow-hidden">
                <IndexTable />
                <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-[#111d2e] via-[#111d2e]/80 to-transparent pointer-events-none" />
              </div>
            </div>
          </div>

          <Spotlight
            className="-top-40 left-0 md:left-60 md:-top-20"
            fill="#6fd1b0"
          />
          <Spotlight
            className="-top-40 right-0 md:right-80 md:-top-32"
            fill="#ba96e3"
          />
        </div>
      </main>

      <div className="absolute inset-0 flex items-center justify-center z-[200] pointer-events-none">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="w-full max-w-md px-4 pointer-events-auto"
        >
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="bg-[#0d1926]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
          >
            <h1 className="text-white text-2xl font-serif font-semibold text-center mb-2">
              Join the Waitlist
            </h1>
            <p className="text-gray-400 text-center mb-6 font-sans">
              Be the first to know when Pindex launches.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="text"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (status === 'error') setStatus('idle')
                }}
                placeholder="Enter your email"
                className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-white/30 transition-colors font-sans"
              />
              <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full px-4 py-3 rounded-lg font-medium text-white transition-all duration-200 hover:brightness-125 disabled:opacity-50 font-sans"
                style={{
                  background: 'linear-gradient(90deg, #455a70 0%, #2f3d4d 50%, #455a70 100%)'
                }}
              >
                {status === 'loading' ? 'Joining...' : 'Join Waitlist'}
              </button>
            </form>

            <p className={`mt-4 text-center text-sm font-sans h-5 ${status === 'success' ? 'text-green-400' : status === 'error' ? 'text-red-400' : 'text-transparent'}`}>
              {message || 'Placeholder'}
            </p>

            <p className="text-gray-500 text-sm text-center mt-6 font-sans">
              <Link href="/" className="hover:text-gray-300 transition-colors">
                ← Back to home
              </Link>
            </p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}
