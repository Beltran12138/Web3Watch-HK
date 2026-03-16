import { useState, useEffect } from 'react'
import axios from 'axios'

function App() {
  const [news, setNews] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get('/api/news?limit=20')
      .then(res => {
        setNews(res.data.data || [])
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to fetch news:', err)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">加载中...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <h1 className="text-3xl font-bold mb-6">Alpha Radar - 行业情报</h1>
      <div className="space-y-4">
        {news.map(item => (
          <div key={item.id} className="bg-white rounded-lg p-4 shadow">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{item.title}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  来源：{item.source} | 评分：{item.alpha_score}
                </p>
              </div>
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                item.alpha_score >= 85 ? 'bg-red-100 text-red-700' :
                item.alpha_score >= 60 ? 'bg-yellow-100 text-yellow-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {item.alpha_score >= 85 ? '紧急' : item.alpha_score >= 60 ? '重要' : '关注'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default App
