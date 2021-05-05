import SparkMD5 from 'spark-md5'

onmessage = function(event) {
  getFileHash(event.data)
}

function getFileHash({file, chunkSize}) {
  console.log(file, chunkSize)
  const spark = new SparkMD5.ArrayBuffer()
  const reader = new FileReader()
  reader.readAsArrayBuffer(file)

  reader.addEventListener('loadend', () => {
    const content = reader.result
    // 抽样hash计算
    // 规则：每半个切片大小取前10个
    let i = 0

    while(chunkSize / 2 * (i + 1) + 10 < file.size) {
      spark.append(content.slice(chunkSize / 2 * i, chunkSize / 2 * i + 10))
      i++
    }

    const hash = spark.end()
    postMessage(hash)
  })

  reader.addEventListener('error', function _error(err) {
    postMessage(err)
  })
}