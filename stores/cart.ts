import { defineStore } from 'pinia'
import type { Product, CartItem } from '~/types'

export const useCartStore = defineStore('cart', () => {
  const items = ref<CartItem[]>([])

  // Load cart from localStorage on initialization
  if (import.meta.client) {
    const savedCart = localStorage.getItem('skateboard-academy-cart')
    if (savedCart) {
      try {
        items.value = JSON.parse(savedCart)
      } catch (e) {
        console.error('Failed to parse saved cart:', e)
      }
    }
  }

  // Save cart to localStorage whenever it changes
  watch(items, (newItems) => {
    if (import.meta.client) {
      localStorage.setItem('skateboard-academy-cart', JSON.stringify(newItems))
    }
  }, { deep: true })

  const totalItems = computed(() => 
    items.value.reduce((sum, item) => sum + item.quantity, 0)
  )

  const subtotal = computed(() => 
    items.value.reduce((sum, item) => {
      const price = item.product.sale_price || item.product.price
      return sum + (price * item.quantity)
    }, 0)
  )

  // Tax calculation (example: 8% sales tax)
  const taxRate = 0.08
  const tax = computed(() => subtotal.value * taxRate)

  const total = computed(() => subtotal.value + tax.value)

  const addItem = (product: Product, quantity = 1) => {
    // Don't add services/quote items to cart
    if (product.requires_quote || product.is_service) {
      return false
    }

    const existingItem = items.value.find(
      item => item.product.id === product.id
    )

    if (existingItem) {
      // Check stock limit
      const newQuantity = existingItem.quantity + quantity
      if (newQuantity <= product.stock_quantity) {
        existingItem.quantity = newQuantity
        return true
      }
      return false
    } else {
      if (quantity <= product.stock_quantity) {
        items.value.push({ product, quantity })
        return true
      }
      return false
    }
  }

  const removeItem = (productId: string) => {
    const index = items.value.findIndex(
      item => item.product.id === productId
    )
    if (index !== -1) {
      items.value.splice(index, 1)
    }
  }

  const updateQuantity = (productId: string, quantity: number) => {
    const item = items.value.find(
      item => item.product.id === productId
    )
    if (item) {
      if (quantity <= 0) {
        removeItem(productId)
      } else if (quantity <= item.product.stock_quantity) {
        item.quantity = quantity
      }
    }
  }

  const clearCart = () => {
    items.value = []
  }

  const isInCart = (productId: string) => {
    return items.value.some(item => item.product.id === productId)
  }

  const getItemQuantity = (productId: string) => {
    const item = items.value.find(item => item.product.id === productId)
    return item?.quantity || 0
  }

  return {
    items,
    totalItems,
    subtotal,
    tax,
    taxRate,
    total,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    isInCart,
    getItemQuantity,
  }
})
