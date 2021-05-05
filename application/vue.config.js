
module.exports = {
  devServer: {
    port: 8899,
    open: false,
    overlay: {
      warnings: false,
      errors: true
    },
    // 配置代理 （以接口 https://www.easy-mock.com/mock/5ce2a7854c85c12abefbae0b/api 说明）
    proxy: {
      "/wjyz": {
        target: 'https://www.cnblogs.com/',
        changeOrigin: true // 是否改变域名
        // pathRewrite: {
        //   // 路径重写
        //   "/api": "" // 这个意思就是以api开头的，定向到哪里, 如果你的后边还有路径的话， 会自动拼接上
        // }
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true //
      }
    }
    // 下边这个， 如果你是本地自己mock 的话用after这个属性，线上环境一定要干掉
    // after: require("./mock/mock-server.js")
  },
  configureWebpack: config => {
    config.module.rules.push(
      {
        test: /\.worker\.js$/,
        use: { loader: "worker-loader" }
      }
    )
  },
  parallel: false,
  chainWebpack: config => {
    config.output.globalObject('this')
  }
}