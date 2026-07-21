import { Routes, Route } from 'react-router'
import Navbar from '../components/Navbar'
import Hero from '../components/Hero'
import FetchedData from '../components/FetchedData'
import Automation from '../components/Automation'
import Status from '../components/Status'

const Myroutes = () => {
    return (
        <>
            <Navbar />
            <Routes>
                <Route path='/' element={<Hero/>} />
                <Route path='/fetched' element={<FetchedData/>} />
                <Route path='/automation' element={<Automation/>} />
                <Route path='/status' element={<Status/>} />
            </Routes>
        </>
    )
}

export default Myroutes
