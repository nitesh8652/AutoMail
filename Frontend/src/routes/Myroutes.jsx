import { Routes, Route } from 'react-router'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import Hero from '../components/pages/Hero'
import FetchedData from '../components/pages/FetchedData'
import Automation from '../components/pages/Automation'
import Status from '../components/pages/Status'

const Myroutes = () => {
    return (
        <>
            <Navbar />
            <div className="flex-1">
                <Routes>
                    <Route path='/' element={<Hero/>} />
                    <Route path='/fetched' element={<FetchedData/>} />
                    <Route path='/automation' element={<Automation/>} />
                    <Route path='/status' element={<Status/>} />
                </Routes>
            </div>
            <Footer />
        </>
    )
}

export default Myroutes
