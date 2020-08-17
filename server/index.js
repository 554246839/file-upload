// 导入koa，和koa 1.x不同，在koa2中，我们导入的是一个class，因此用大写的Koa表示:
const Koa = require('koa');
const router = require('koa-router')()
const fs = require('fs')
const path = require('path')
const koaBody = require('koa-body') //解析上传文件的插件
const static = require('koa-static')

const uploadPath = path.join(__dirname, 'public/uploads') // 文件上传目录

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath)
}

// 创建一个Koa对象表示web app本身:
const app = new Koa();

app.use(static('public', {
  maxAge: 30 * 24 * 3600 * 1000 // 静态资源缓存时间 ms
}));

// 对于任何请求，app将调用该异步函数处理请求：
app.use(async (ctx, next) => {
  console.log(`Process ${ctx.request.method} ${ctx.request.url}...`);

  ctx.set('Access-Control-Allow-Origin', '*');//*表示可以跨域任何域名都行 也可以填域名表示只接受某个域名
  ctx.set('Access-Control-Allow-Headers', 'X-Requested-With,Content-Type,token');//可以支持的消息首部列表
  ctx.set('Access-Control-Allow-Methods', 'PUT,POST,GET,DELETE,OPTIONS');//可以支持的提交方式
  ctx.set('Content-Type', 'application/json;charset=utf-8');//请求头中定义的类型

  if (ctx.request.method === 'OPTIONS') {
    ctx.response.status = 200
  }

  try {
    await next();
  } catch (err) {
    console.log(err, 'errmessage')
    ctx.response.status = err.statusCode || err.status || 500
    ctx.response.body = {
      code: 500,
      msg: err.message
    }
    ctx.app.emit('error', err, ctx);
  }
})

app.use(koaBody({
  multipart: true,
  formidable: {
    // keepExtensions: true,
    uploadDir: uploadPath,
    maxFileSize: 10000 * 1024 * 1024    // 设置上传文件大小最大限制，默认20M
  }
}))

// 删除文件夹及内部所有文件
function deleteFiles(dirpath) {
  console.log(dirpath)
  if (fs.existsSync(dirpath)) {
    fs.readdir(dirpath, (err, files) => {
      if (err) throw err
      while(files.length) {
        fs.unlinkSync(dirpath + files.shift())
      }
      fs.rmdir(dirpath, () => {})
    })
  }
}

// 文件上传处理
function uploadFn(ctx, destPath) {
  return new Promise((resolve, reject) => {
    const { name, path: _path } = ctx.request.files.file
    const filePath = destPath || path.join(uploadPath, name)

    fs.rename(_path, filePath, (err) => {
      if (err) {
        return reject(err)
      }
      resolve(name)
    })
  })
}

/**
 * 文件异步合并
 * @param {String} dirPath 分片文件夹
 * @param {String} filePath 目标文件
 * @param {String} hash 文件hash
 * @param {Number} total 分片文件总数
 * @returns {Promise}
 */
function mergeFile(dirPath, filePath, hash, total) {
  return new Promise((resolve, reject) => {
    fs.readdir(dirPath, (err, files) => {
      if (err) {
        return reject(err)
      }
      if(files.length !== total || !files.length) {
        return reject('上传失败，切片数量不符')
      }

      const fileWriteStream = fs.createWriteStream(filePath)
      function merge(i) {
        return new Promise((res, rej) => {
          // 合并完成
          if (i === files.length) {
            fs.rmdir(dirPath, (err) => {
              console.log(err, 'rmdir')
            })
            return res()
          }
          const chunkpath = dirPath + hash + '-' + i
          fs.readFile(chunkpath, (err, data) => {
            if (err) return rej(err)

            // 将切片追加到存储文件
            fs.appendFile(filePath, data, () => {
              // 删除切片文件
              fs.unlink(chunkpath, () => {
                // 递归合并
                res(merge(i + 1))
              })
            })
          })

        })
      }
      merge(0).then(() => {
        // 默认情况下不需要手动关闭，但是在某些文件的合并并不会自动关闭可写流，比如压缩文件，所以这里在合并完成之后，统一关闭下
        resolve(fileWriteStream.close())
      })
    })
  })
}

router.post('/api/upload/file', async function uploadFile(ctx) {
  await uploadFn(ctx).then((name) => {
    ctx.body = {
      code: 0,
      url: path.join('http://localhost:3000/uploads', name),
      msg: '文件上传成功'
    }
  }).catch(err => {
    console.log(err)
    ctx.body = {
      code: -1,
      msg: '文件上传失败'
    }
  })
})

router.post('/api/upload/snippet', async function snippet(ctx) {
  const { index, hash } = ctx.request.body

  // 切片上传目录
  const chunksPath = path.join(uploadPath, hash, '/')

  if(!fs.existsSync(chunksPath)) {
    fs.mkdirSync(chunksPath)
  }

  // 切片文件
  const chunksFileName = chunksPath + hash + '-' + index

  await uploadFn(ctx, chunksFileName).then(name => {
    ctx.body = {
      code: 0,
      msg: '切片上传完成'
    }
  }).catch(err => {
    console.log(err)
    ctx.body = {
      code: -1,
      msg: '切片上传失败'
    }
  })
})

/**
 * 1、判断是否有切片hash文件夹
 * 2、判断文件夹内的文件数量是否等于total
 * 4、然后合并切片
 * 5、删除切片文件信息
 */
router.post('/api/upload/merge', async function uploadFile(ctx) {
  const { total, hash, name } = ctx.request.body
  const dirPath = path.join(uploadPath, hash, '/')
  const filePath = path.join(uploadPath, name) // 合并文件

  // 已存在文件，则表示已上传成功
  if (fs.existsSync(filePath)) {
    deleteFiles(dirPath)
    ctx.body = {
      code: 0,
      url: path.join('http://localhost:3000/uploads', name),
      msg: '文件上传成功'
    }
  // 如果没有切片hash文件夹则表明上传失败
  } else if (!fs.existsSync(dirPath)) {
    ctx.body = {
      code: -1,
      msg: '文件上传失败'
    }
  } else {
    await mergeFile(dirPath, filePath, hash, total).then(() => {
      ctx.body = {
        code: 0,
        url: path.join('http://localhost:3000/uploads', name),
        msg: '文件上传成功'
      }
    }).catch(err => {
      ctx.body = {
        code: -1,
        msg: err
      }
    })
  }
})

app.on('error', err => {
  console.error(err)
})

app.use(router.routes())

// 在端口3000监听:
app.listen(3000);
console.log('app started at port 3000...');