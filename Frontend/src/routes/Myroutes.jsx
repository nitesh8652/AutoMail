import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import MiLoader from '../components/MiLoader'

// Each page is its own chunk, so the first visit only downloads the page being opened.
const Hero = lazy(() => import('../components/pages/Hero'))
const FetchedData = lazy(() => import('../components/pages/FetchedData'))
const Automation = lazy(() => import('../components/pages/Automation'))
const Status = lazy(() => import('../components/pages/Status'))
const IntelligenceData = lazy(() => import('../components/pages/IntelligenceData'))

const PageFallback = () => (
    <div className="flex justify-center py-[70px]">
        <MiLoader size={18} />
    </div>
)

const Myroutes = () => {
    return (
        <>
            <Navbar />
            <div className="flex-1">
                <Suspense fallback={<PageFallback />}>
                    <Routes>
                        <Route path='/' element={<Hero/>} />
                        <Route path='/fetched' element={<FetchedData/>} />
                        <Route path='/automation' element={<Automation/>} />
                        <Route path='/status' element={<Status/>} />
                        <Route path='/intelligence' element={<IntelligenceData/>} />
                    </Routes>
                </Suspense>
            </div>
            <Footer />
        </>
    )
}

export default Myroutes
