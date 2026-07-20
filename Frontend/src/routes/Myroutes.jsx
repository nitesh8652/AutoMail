import { Routes, Route } from 'react-router'
import Navbar from '../components/Navbar'
import Hero from '../components/Hero'
import FetchedData from '../components/FetchedData'

const Myroutes = () => {
    return (
        <>
            <Navbar />
            <Routes>
                <Route path='/' element={<Hero/>} />
                <Route path='/fetched' element={<FetchedData/>} />
            </Routes>
        </>
    )
}

export default Myroutes
