import { Smile, Frown, Send, Cross, CrossIcon, Accessibility, CheckCheck, Check, UserRoundCheck, UserRoundMinusIcon } from 'lucide-react'

const Automation = () => {
    return (
        <>
            <div className="div w-[88%] rounded-2xl bg-[#e4e8ec65] m-auto p-3">

                <div className="mx-4 w-[700px] bg-white border border-slate-200 grid grid-cols-6 gap-2 rounded-xl p-2 text-sm">
                    <h1 className="text-center text-slate-200 text-xl font-bold col-span-6">Send Feedback</h1>
                    <textarea placeholder="GPT Output..." className="bg-slate-100 text-slate-600 h-[400px] placeholder:text-slate-600 placeholder:opacity-50 border border-slate-200 col-span-6 resize-none outline-none rounded-lg p-2 duration-300 focus:border-slate-600"></textarea>

                    <button
                        type="button"
                        className="group col-span-1 flex items-center justify-center rounded-lg
                                    border border-slate-200 bg-slate-100 p-[6px] duration-300
                                    hover:bg-red-200 focus:bg-red-600"
                    >
                        <UserRoundMinusIcon
                            className="h-5 w-5 text-black duration-300 group-focus:text-white"
                        />
                    </button>

                    <button
                        type="button"
                        className="group col-span-1 flex items-center justify-center rounded-lg
                                    border border-slate-200 bg-slate-100 p-[6px] duration-300
                                    hover:bg-green-200 focus:bg-green-500"
                    >
                        <Check
                            className="h-5 w-5 text-slate-600 duration-300 group-focus:text-white"
                        />
                    </button>
                    {/* <span className="col-span-2"></span>
                    <button className="bg-slate-100 border border-slate-200 col-span-2 flex justify-center rounded-lg p-2 duration-300 hover:border-slate-600 hover:text-white focus:bg-blue-400">
                        <Send className="w-[30px] h-[30px] text-slate-600 focus:text-blue-200" />
                    </button> */}
                </div>

            </div>

        </>
    )
}

export default Automation